import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  accountIds: z.array(z.string()).min(1).max(50).optional(),
  maxPosts: z.number().int().min(1).max(50).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  showPlatformIcons: z.boolean().optional(),
  showTimestamps: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

// ── PATCH /api/feed-widgets/[id] ─────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;

    const existing = await prisma.feedWidget.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const widget = await prisma.feedWidget.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ widget });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/feed-widgets/[id] ────────────────────────────────────────────

export async function DELETE(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;

    const existing = await prisma.feedWidget.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.feedWidget.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
