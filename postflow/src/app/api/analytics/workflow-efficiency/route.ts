import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const PERIOD_DAYS: Record<string, number> = {
  "30d": 30,
  "90d": 90,
};

const querySchema = z.object({
  period: z.enum(["30d", "90d"]).default("30d"),
});

export interface StatusDistributionEntry {
  status: string;
  count: number;
}

export interface WorkflowEfficiencyResponse {
  period: string;
  avgDraftToScheduledHours: number | null;
  avgScheduledToPublishedHours: number | null;
  avgDraftToPublishedHours: number | null;
  fastestPublishHours: number | null;
  slowestPublishHours: number | null;
  postsPublished: number;
  postsStillDraft: number;
  statusDistribution: StatusDistributionEntry[];
}

function msToHours(ms: number): number {
  return Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

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

    const parsed = querySchema.safeParse({
      period: request.nextUrl.searchParams.get("period") ?? "30d",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period } = parsed.data;
    const userId = session.user.id;
    const daysBack = PERIOD_DAYS[period];
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    const posts = await prisma.post.findMany({
      where: {
        userId,
        OR: [
          { scheduledAt: { gte: since } },
          { updatedAt: { gte: since } },
          { createdAt: { gte: since } },
        ],
      },
      select: {
        status: true,
        createdAt: true,
        scheduledAt: true,
        publishResults: {
          select: { publishedAt: true, status: true },
          orderBy: { publishedAt: "asc" },
        },
      },
    });

    // ── Status distribution ───────────────────────────────────────────────────
    const statusCounts = new Map<string, number>();
    for (const post of posts) {
      const s = post.status as string;
      statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
    }
    const statusDistribution: StatusDistributionEntry[] = Array.from(
      statusCounts.entries()
    )
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const postsPublished = posts.filter(
      (p) => p.status === PostStatus.PUBLISHED
    ).length;

    const postsStillDraft = posts.filter(
      (p) => p.status === PostStatus.DRAFT
    ).length;

    // ── Time metrics ──────────────────────────────────────────────────────────
    const draftToScheduledMs: number[] = [];
    const scheduledToPublishedMs: number[] = [];
    const draftToPublishedMs: number[] = [];

    for (const post of posts) {
      const firstPublished = post.publishResults.find(
        (pr) => pr.publishedAt != null
      )?.publishedAt;

      // draft → scheduled
      if (post.scheduledAt != null) {
        const diff = post.scheduledAt.getTime() - post.createdAt.getTime();
        if (diff >= 0) {
          draftToScheduledMs.push(diff);
        }
      }

      // scheduled → published
      if (post.scheduledAt != null && firstPublished != null) {
        const diff = firstPublished.getTime() - post.scheduledAt.getTime();
        if (diff >= 0) {
          scheduledToPublishedMs.push(diff);
        }
      }

      // draft → published
      if (firstPublished != null) {
        const diff = firstPublished.getTime() - post.createdAt.getTime();
        if (diff >= 0) {
          draftToPublishedMs.push(diff);
        }
      }
    }

    const avgDraftToScheduledHours =
      avg(draftToScheduledMs.map(msToHours));
    const avgScheduledToPublishedHours =
      avg(scheduledToPublishedMs.map(msToHours));
    const avgDraftToPublishedHours =
      avg(draftToPublishedMs.map(msToHours));

    const fastestPublishHours =
      draftToPublishedMs.length > 0
        ? msToHours(Math.min(...draftToPublishedMs))
        : null;
    const slowestPublishHours =
      draftToPublishedMs.length > 0
        ? msToHours(Math.max(...draftToPublishedMs))
        : null;

    return NextResponse.json({
      period,
      avgDraftToScheduledHours,
      avgScheduledToPublishedHours,
      avgDraftToPublishedHours,
      fastestPublishHours,
      slowestPublishHours,
      postsPublished,
      postsStillDraft,
      statusDistribution,
    } satisfies WorkflowEfficiencyResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
