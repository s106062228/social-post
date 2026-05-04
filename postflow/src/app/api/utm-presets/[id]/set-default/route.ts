import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── PATCH /api/utm-presets/[id]/set-default ───────────────────────────────────
// Sets the specified preset as the default, clearing any existing default.

export async function PATCH(
  _request: NextRequest,
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
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;
    if (!id || id.length < 10) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const preset = await prisma.utmPreset.findUnique({ where: { id } });
    if (!preset || preset.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Clear existing default then set new one atomically
    await prisma.$transaction([
      prisma.utmPreset.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.utmPreset.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    const updated = await prisma.utmPreset.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        source: true,
        medium: true,
        campaign: true,
        content: true,
        term: true,
        isDefault: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}
