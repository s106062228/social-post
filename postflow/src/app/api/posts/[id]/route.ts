import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { logActivity } from "@/lib/activity-log";
import { scheduleReminder, cancelReminder } from "@/lib/queue/scheduler";

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const updatePostSchema = z
  .object({
    content: z.string().min(1).max(63206).optional(),
    mediaType: z.nativeEnum(MediaType).optional(),
    mediaUrls: z.array(z.string().url()).optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    status: z
      .enum([PostStatus.DRAFT, PostStatus.SCHEDULED])
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

const postIdSchema = z.string().cuid();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOwnedPost(postId: string, userId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return null;
  if (post.userId !== userId) return null;
  return post;
}

// ── GET /api/posts/[id] ────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        publishResults: {
          select: {
            id: true,
            platform: true,
            accountId: true,
            status: true,
            platformPostId: true,
            publishedUrl: true,
            publishedAt: true,
            error: true,
            retryCount: true,
          },
        },
      },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json(post);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/posts/[id] ──────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const post = await getOwnedPost(id, session.user.id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Only allow editing posts that haven't been published or are currently publishing
    if (
      post.status === PostStatus.PUBLISHED ||
      post.status === PostStatus.PARTIALLY_PUBLISHED ||
      post.status === PostStatus.PUBLISHING
    ) {
      return NextResponse.json(
        { error: "Cannot edit a post that is publishing or already published" },
        { status: 409 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updatePostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { content, mediaType, mediaUrls, scheduledAt, status } = parsed.data;

    // Derive status from scheduledAt if status not explicitly provided
    let newStatus: PostStatus | undefined = status;
    if (scheduledAt !== undefined && !status) {
      newStatus = scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT;
    }

    // Save a version snapshot before overwriting content so history is preserved.
    const contentChanging = content !== undefined && content !== post.content;
    const mediaTypeChanging = mediaType !== undefined && mediaType !== post.mediaType;
    const mediaUrlsChanging =
      mediaUrls !== undefined &&
      JSON.stringify(mediaUrls) !== JSON.stringify(post.mediaUrls);
    const shouldSnapshot = contentChanging || mediaTypeChanging || mediaUrlsChanging;

    const updateOp = prisma.post.update({
      where: { id },
      data: {
        ...(content !== undefined && { content }),
        ...(mediaType !== undefined && { mediaType }),
        ...(mediaUrls !== undefined && { mediaUrls }),
        ...(scheduledAt !== undefined && {
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        }),
        ...(newStatus !== undefined && { status: newStatus }),
      },
      include: { publishResults: true },
    });

    let updated: Awaited<typeof updateOp>;
    if (shouldSnapshot) {
      const [postResult] = await prisma.$transaction([
        updateOp,
        prisma.postVersion.create({
          data: {
            postId: id,
            userId: session.user.id,
            content: post.content,
            mediaType: post.mediaType,
            mediaUrls: post.mediaUrls,
          },
        }),
      ]);
      updated = postResult;
    } else {
      updated = await updateOp;
    }

    // Reschedule reminder when scheduledAt changes on a post with reminderMinutes set
    if (scheduledAt !== undefined && updated.reminderMinutes) {
      if (updated.scheduledAt) {
        scheduleReminder(
          id,
          session.user.id,
          updated.scheduledAt,
          updated.reminderMinutes
        ).catch(() => { /* fire-and-forget */ });
      } else {
        cancelReminder(id).catch(() => { /* fire-and-forget */ });
      }
    }

    logActivity({
      userId: session.user.id,
      action: "post.updated",
      entityId: id,
      entityType: "post",
      metadata: { fields: Object.keys(parsed.data) },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/posts/[id] ────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const post = await getOwnedPost(id, session.user.id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Prevent deletion of posts that are currently being published
    if (post.status === PostStatus.PUBLISHING) {
      return NextResponse.json(
        { error: "Cannot delete a post that is currently being published" },
        { status: 409 }
      );
    }

    // Delete publish results first (cascade)
    await prisma.$transaction([
      prisma.publishResult.deleteMany({ where: { postId: id } }),
      prisma.post.delete({ where: { id } }),
    ]);

    logActivity({
      userId: session.user.id,
      action: "post.deleted",
      entityId: id,
      entityType: "post",
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
