import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── POST /api/saved-prompts/[id]/use ──────────────────────────────────────────
// Increment usageCount for a saved prompt. The prompt can be the user's own or
// a public community prompt. Auth required.

export async function POST(
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

    // Allow use of own prompts or public community prompts
    const existing = await prisma.savedPrompt.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!existing.isPublic && existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.savedPrompt.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
      select: { usageCount: true },
    });

    return NextResponse.json({ usageCount: updated.usageCount });
  } catch (err) {
    return handleRouteError(err);
  }
}
