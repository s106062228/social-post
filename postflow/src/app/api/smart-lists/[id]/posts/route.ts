import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ContentCategory, MediaType, Platform, PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

interface SmartListFilters {
  statuses?: string[];
  platforms?: string[];
  sentiment?: string;
  tagIds?: string[];
  starred?: boolean;
  evergreen?: boolean;
  archived?: boolean;
  contentContains?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  contentCategory?: string;
  workflowStageId?: string;
  mediaType?: string;
}

function buildWhereFromFilters(
  userId: string,
  filters: SmartListFilters
): Record<string, unknown> {
  const where: Record<string, unknown> = { userId };

  // Archived filter (default: exclude archived)
  if (filters.archived === true) {
    where.archivedAt = { not: null };
  } else {
    where.archivedAt = null;
  }

  // Status filter
  if (filters.statuses && filters.statuses.length > 0) {
    const validStatuses = filters.statuses.filter(
      (s): s is PostStatus => Object.values(PostStatus).includes(s as PostStatus)
    );
    if (validStatuses.length > 0) {
      where.status = { in: validStatuses };
    }
  }

  // Platform filter (via publishResults)
  if (filters.platforms && filters.platforms.length > 0) {
    const validPlatforms = filters.platforms.filter(
      (p): p is Platform => Object.values(Platform).includes(p as Platform)
    );
    if (validPlatforms.length > 0) {
      where.publishResults = { some: { platform: { in: validPlatforms } } };
    }
  }

  // Content contains
  if (filters.contentContains) {
    where.content = { contains: filters.contentContains, mode: "insensitive" };
  }

  // Sentiment
  if (filters.sentiment) {
    where.sentiment = filters.sentiment;
  }

  // Starred
  if (filters.starred === true) {
    where.starred = true;
  }

  // Evergreen
  if (filters.evergreen === true) {
    where.isEvergreen = true;
  }

  // Tag IDs
  if (filters.tagIds && filters.tagIds.length > 0) {
    where.tags = { some: { tagId: { in: filters.tagIds } } };
  }

  // Scheduled date range
  if (filters.scheduledFrom || filters.scheduledTo) {
    const scheduledAt: Record<string, Date> = {};
    if (filters.scheduledFrom) scheduledAt.gte = new Date(filters.scheduledFrom);
    if (filters.scheduledTo) scheduledAt.lte = new Date(filters.scheduledTo);
    where.scheduledAt = scheduledAt;
  }

  // Content category
  if (filters.contentCategory) {
    const validCategories = Object.values(ContentCategory) as string[];
    if (validCategories.includes(filters.contentCategory)) {
      where.contentCategory = filters.contentCategory as ContentCategory;
    }
  }

  // Workflow stage
  if (filters.workflowStageId) {
    where.workflowStageId = filters.workflowStageId;
  }

  // Media type
  if (filters.mediaType) {
    const validMediaTypes = Object.values(MediaType) as string[];
    if (validMediaTypes.includes(filters.mediaType)) {
      where.mediaType = filters.mediaType as MediaType;
    }
  }

  return where;
}

// ── GET /api/smart-lists/[id]/posts ──────────────────────────────────────────

export async function GET(
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

    const smartList = await prisma.smartList.findUnique({ where: { id } });
    if (!smartList || smartList.userId !== session.user.id) {
      return NextResponse.json({ error: "Smart list not found" }, { status: 404 });
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const pagination = paginationSchema.parse(searchParams);
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const filters = (smartList.filters as SmartListFilters) ?? {};
    const where = buildWhereFromFilters(session.user.id, filters);

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
          workflowStage: {
            select: { id: true, name: true, color: true },
          },
        },
      }),
      prisma.post.count({ where }),
    ]);

    return NextResponse.json({
      posts,
      total,
      smartList: {
        id: smartList.id,
        name: smartList.name,
        description: smartList.description,
        filters: smartList.filters,
        pinned: smartList.pinned,
      },
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
