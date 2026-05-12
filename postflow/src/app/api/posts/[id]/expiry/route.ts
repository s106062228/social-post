import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { scheduleExpiry, cancelExpiry } from "@/lib/queue/scheduler";

const postIdSchema = z.string().cuid();

// expiresAt: null clears the expiry; ISO datetime string sets it (must be future)
const bodySchema = z.object({
  expiresAt: z.string().datetime().nullable(),
});

// ── PATCH /api/posts/[id]/expiry ──────────────────────────────────────────────

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
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { expiresAt: expiresAtRaw } = parsed.data;
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

    if (expiresAt && expiresAt <= new Date()) {
      return NextResponse.json(
        { error: "expiresAt must be in the future" },
        { status: 422 }
      );
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    await prisma.post.update({
      where: { id },
      data: { expiresAt },
    });

    if (expiresAt) {
      await scheduleExpiry(id, session.user.id, expiresAt);
    } else {
      await cancelExpiry(id);
    }

    return NextResponse.json({ expiresAt: expiresAt?.toISOString() ?? null });
  } catch (err) {
    return handleRouteError(err);
  }
}
