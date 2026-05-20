import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MediaType } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const postIdSchema = z.string().cuid();

const createThreadPostSchema = z.object({
  content: z.string().min(1).max(63206),
  mediaUrls: z.array(z.string().url()).max(10).optional().default([]),
  mediaType: z.nativeEnum(MediaType).optional().default(MediaType.NONE),
  order: z.number().int().min(0).optional(),
});

// ── GET /api/posts/[id]/threads ───────────────────────────────────────────────

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

    const threads = await prisma.threadPost.findMany({
      where: { postId: id },
      orderBy: { order: "asc" },
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

    return NextResponse.json({ threads });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/posts/[id]/threads ──────────────────────────────────────────────

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
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = createThreadPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Determine next order value if not specified
    let order = parsed.data.order;
    if (order === undefined) {
      const maxOrder = await prisma.threadPost.aggregate({
        where: { postId: id },
        _max: { order: true },
      });
      order = (maxOrder._max.order ?? -1) + 1;
    }

    const thread = await prisma.threadPost.create({
      data: {
        postId: id,
        order,
        content: parsed.data.content,
        mediaUrls: parsed.data.mediaUrls,
        mediaType: parsed.data.mediaType,
      },
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

    return NextResponse.json({ thread }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PUT /api/posts/[id]/threads (bulk replace) ────────────────────────────────

export async function PUT(
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
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const bulkSchema = z.object({
      threads: z.array(
        z.object({
          content: z.string().min(1).max(63206),
          mediaUrls: z.array(z.string().url()).max(10).default([]),
          mediaType: z.nativeEnum(MediaType).default(MediaType.NONE),
        })
      ).max(25),
    });

    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Replace all thread posts in a transaction
    const threads = await prisma.$transaction(async (tx) => {
      await tx.threadPost.deleteMany({ where: { postId: id } });
      if (parsed.data.threads.length === 0) return [];
      return Promise.all(
        parsed.data.threads.map((item, index) =>
          tx.threadPost.create({
            data: {
              postId: id,
              order: index,
              content: item.content,
              mediaUrls: item.mediaUrls,
              mediaType: item.mediaType,
            },
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
          })
        )
      );
    });

    return NextResponse.json({ threads });
  } catch (err) {
    return handleRouteError(err);
  }
}
