import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const createPostSchema = z.object({
  content: z.string().min(1).max(63206),
  mediaType: z.nativeEnum(MediaType).default(MediaType.NONE),
  mediaUrls: z.array(z.string().url()).default([]),
  scheduledAt: z.string().datetime().nullable().optional(),
});

const listPostsSchema = z.object({
  status: z.nativeEnum(PostStatus).optional(),
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

    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listPostsSchema.safeParse(searchParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { status, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const where = {
      userId: session.user.id,
      ...(status ? { status } : {}),
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

    const { content, mediaType, mediaUrls, scheduledAt } = parsed.data;

    // Determine initial status
    const status = scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT;

    const post = await prisma.post.create({
      data: {
        userId: session.user.id,
        content,
        mediaType,
        mediaUrls,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status,
      },
      include: {
        publishResults: true,
      },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
