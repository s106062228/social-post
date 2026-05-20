import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MediaType } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const postIdSchema = z.string().cuid();

const updateThreadPostSchema = z
  .object({
    content: z.string().min(1).max(63206).optional(),
    mediaUrls: z.array(z.string().url()).max(10).optional(),
    mediaType: z.nativeEnum(MediaType).optional(),
    order: z.number().int().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

async function getThreadWithOwnership(
  postId: string,
  threadId: string,
  userId: string
) {
  const thread = await prisma.threadPost.findUnique({
    where: { id: threadId },
    include: { post: { select: { userId: true } } },
  });
  if (!thread || thread.postId !== postId || thread.post.userId !== userId) {
    return null;
  }
  return thread;
}

// ── PATCH /api/posts/[id]/threads/[threadId] ──────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> }
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

    const { id, threadId } = await params;
    if (!postIdSchema.safeParse(id).success || !postIdSchema.safeParse(threadId).success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const thread = await getThreadWithOwnership(id, threadId, session.user.id);
    if (!thread) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = updateThreadPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await prisma.threadPost.update({
      where: { id: threadId },
      data: parsed.data,
      select: {
        id: true,
        postId: true,
        order: true,
        content: true,
        mediaUrls: true,
        mediaType: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ thread: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/posts/[id]/threads/[threadId] ─────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> }
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

    const { id, threadId } = await params;
    if (!postIdSchema.safeParse(id).success || !postIdSchema.safeParse(threadId).success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const thread = await getThreadWithOwnership(id, threadId, session.user.id);
    if (!thread) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.threadPost.delete({ where: { id: threadId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
