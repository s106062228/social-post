import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const postIdSchema = z.string().cuid();

const createCommentSchema = z.object({
  comment: z.string().min(1).max(2000).trim(),
});

// ── GET /api/posts/[id]/comments ───────────────────────────────────────────────

export async function GET(
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
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const comments = await prisma.postComment.findMany({
      where: { postId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        authorName: true,
        comment: true,
        resolved: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ comments, currentUserId: session.user.id });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/posts/[id]/comments ─────────────────────────────────────────────

export async function POST(
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

    const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createCommentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const authorName = session.user.name ?? session.user.email ?? "User";

    const comment = await prisma.postComment.create({
      data: {
        postId: id,
        userId: session.user.id,
        authorName,
        comment: parsed.data.comment,
      },
      select: {
        id: true,
        userId: true,
        authorName: true,
        comment: true,
        resolved: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
