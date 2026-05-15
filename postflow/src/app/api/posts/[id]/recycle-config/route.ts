import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const postIdSchema = z.string().cuid();

const recycleConfigSchema = z.object({
  recycleInterval: z.number().int().min(1).max(365).nullable(),
});

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

    const body = await request.json().catch(() => null);
    const parsed = recycleConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true, isEvergreen: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (!post.isEvergreen) {
      return NextResponse.json(
        { error: "Recycle config can only be set on evergreen posts" },
        { status: 409 }
      );
    }

    const { recycleInterval } = parsed.data;

    const updated = await prisma.post.update({
      where: { id },
      data: {
        recycleInterval,
        // Clear lastRecycledAt when changing interval so the clock resets
        ...(recycleInterval === null ? { lastRecycledAt: null } : {}),
      },
      select: { recycleInterval: true, lastRecycledAt: true },
    });

    return NextResponse.json({
      recycleInterval: updated.recycleInterval,
      lastRecycledAt: updated.lastRecycledAt,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
