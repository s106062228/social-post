import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ContentCategory, MediaType, Platform, PostStatus, Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizePostContent } from "@/lib/sanitize";
import { logActivity } from "@/lib/activity-log";
import { scheduleReminder } from "@/lib/queue/scheduler";

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const pollSchema = z.object({
  question: z.string().min(1).max(140),
  options: z
    .array(z.string().min(1).max(25))
    .min(2, "At least 2 options are required")
    .max(4, "At most 4 options are allowed"),
  durationHours: z
    .number()
    .int()
    .refine((v: number) => [1, 6, 24, 72, 168].includes(v), {
      message: "durationHours must be one of 1, 6, 24, 72, or 168",
    })
    .default(24),
});

const createPostSchema = z.object({
  content: z.string().min(1).max(63206),
  mediaType: z.nativeEnum(MediaType).default(MediaType.NONE),
  mediaUrls: z.array(z.string().url()).default([]),
  scheduledAt: z.string().datetime().nullable().optional(),
  tagIds: z.array(z.string()).default([]),
  reminderMinutes: z.number().int().min(1).max(10080).nullable().optional(),
  firstComment: z.string().max(2200).nullable().optional(),
  language: z.string().min(2).max(5).nullable().optional(),
  contentCategory: z.nativeEnum(ContentCategory).nullable().optional(),
  altTexts: z.array(z.string().max(2200)).max(10).default([]),
  poll: pollSchema.nullable().optional(),
});

const listPostsSchema = z.object({
  status: z.nativeEnum(PostStatus).optional(),
  search: z.string().max(200).optional(),
  tag: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  platform: z.nativeEnum(Platform).optional(),
  starred: z.enum(["true", "false"]).optional(),
  evergreen: z.enum(["true", "false"]).optional(),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]).optional(),
  tone: z.enum(["professional", "casual", "humorous", "inspirational", "educational", "urgent", "friendly", "authoritative"]).optional(),
  archived: z.enum(["true", "false"]).optional(),
  assignee: z.enum(["me"]).optional(),
  collectionId: z.string().optional(),
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

    const { status, search, tag, from, to, platform, starred, evergreen, sentiment, tone, archived, assignee, collectionId, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const where = {
      // When assignee=me, show posts assigned to current user (regardless of ownership)
      ...(assignee === "me"
        ? { assigneeId: session.user.id }
        : { userId: session.user.id }),
      // By default exclude archived posts; only include them when archived=true
      ...(archived === "true"
        ? { archivedAt: { not: null } }
        : { archivedAt: null }),
      ...(status ? { status } : {}),
      ...(search ? { content: { contains: search, mode: "insensitive" as const } } : {}),
      ...(tag ? { tags: { some: { tagId: tag } } } : {}),
      ...(from || to
        ? {
            scheduledAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(platform
        ? { publishResults: { some: { platform } } }
        : {}),
      ...(starred === "true" ? { starred: true } : {}),
      ...(evergreen === "true" ? { isEvergreen: true } : {}),
      ...(sentiment ? { sentiment } : {}),
      ...(tone ? { tone } : {}),
      ...(collectionId
        ? { collections: { some: { collectionId } } }
        : {}),
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
              insights: {
                select: {
                  impressions: true,
                  reach: true,
                  likes: true,
                  comments: true,
                  shares: true,
                },
              },
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

    const { mediaType, mediaUrls, scheduledAt, tagIds, reminderMinutes, firstComment, language, contentCategory, altTexts, poll } = parsed.data;
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

    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;

    const post = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.post.create({
        data: {
          userId: session.user.id,
          content,
          mediaType,
          mediaUrls,
          scheduledAt: scheduledDate,
          status,
          reminderMinutes: reminderMinutes ?? null,
          firstComment: firstComment ?? null,
          language: language ?? null,
          contentCategory: contentCategory ?? null,
          altTexts,
          tags: validTagIds.length > 0
            ? { create: validTagIds.map((tagId) => ({ tagId })) }
            : undefined,
        },
        include: {
          publishResults: true,
          tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
          poll: true,
        },
      });

      if (poll) {
        await tx.postPoll.create({
          data: {
            postId: created.id,
            question: poll.question,
            options: poll.options,
            durationHours: poll.durationHours,
          },
        });
        // Re-fetch with poll included
        return tx.post.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            publishResults: true,
            tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
            poll: true,
          },
        });
      }

      return created;
    });

    // Schedule reminder if post is SCHEDULED and reminderMinutes is set
    if (status === PostStatus.SCHEDULED && scheduledDate && reminderMinutes) {
      scheduleReminder(post.id, session.user.id, scheduledDate, reminderMinutes).catch(
        () => { /* fire-and-forget */ }
      );
    }

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
