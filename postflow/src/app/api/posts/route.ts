import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizePostContent } from "@/lib/sanitize";
import { logActivity } from "@/lib/activity-log";

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const createPostSchema = z.object({
  content: z.string().min(1).max(63206),
  mediaType: z.nativeEnum(MediaType).default(MediaType.NONE),
  mediaUrls: z.array(z.string().url()).default([]),
  scheduledAt: z.string().datetime().nullable().optional(),
  tagIds: z.array(z.string()).default([]),
});

const listPostsSchema = z.object({
  status: z.nativeEnum(PostStatus).optional(),
  search: z.string().max(200).optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── GET /api/posts ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listPostsSchema.safeParse(searchParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { status, search, tag, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const where = {
      userId: session.user.id,
      ...(status ? { status } : {}),
      ...(search ? { content: { contains: search, mode: "insensitive" as const } } : {}),
      ...(tag ? { tags: { some: { tagId: tag } } } : {}),
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
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
            },
          },
          tags: {
            select: {
              tag: { select: { id: true, name: true, color: true } },
            },
          },
        },
      }),
      prisma.post.count({ where }),
    ]);

    return NextResponse.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/posts ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { mediaType, mediaUrls, scheduledAt, tagIds } = parsed.data;
    const content = sanitizePostContent(parsed.data.content);

    if (content.length === 0) {
      return NextResponse.json(
        { error: "Validation failed", issues: { content: ["Content cannot be empty after sanitization"] } },
        { status: 400 }
      );
    }

    // Determine initial status
    const status = scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT;

    // Validate tag ownership
    let validTagIds: string[] = [];
    if (tagIds.length > 0) {
      const ownedTags = await prisma.tag.findMany({
        where: { id: { in: tagIds }, userId: session.user.id },
        select: { id: true },
      });
      validTagIds = ownedTags.map((t) => t.id);
    }

    const post = await prisma.post.create({
      data: {
        userId: session.user.id,
        content,
        mediaType,
        mediaUrls,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status,
        tags: validTagIds.length > 0
          ? { create: validTagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: {
        publishResults: true,
        tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });

    logActivity({
      userId: session.user.id,
      action: "post.created",
      entityId: post.id,
      entityType: "post",
      metadata: { status: post.status },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
