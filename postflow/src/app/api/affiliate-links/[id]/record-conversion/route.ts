import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const schema = z.object({
  revenue: z.number().min(0).optional(),
});

// ── PATCH /api/affiliate-links/[id]/record-conversion ────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;
    const existing = await prisma.affiliateLink.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: unknown = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const revenueToAdd = parsed.data.revenue ?? 0;

    const link = await prisma.affiliateLink.update({
      where: { id },
      data: {
        conversions: { increment: 1 },
        revenue: { increment: revenueToAdd },
      },
      select: { conversions: true, revenue: true },
    });

    return NextResponse.json(
      { conversions: link.conversions, revenue: link.revenue },
      { headers: rateLimitHeaders(rl) }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
