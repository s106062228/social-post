import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { Platform, PostStatus, PublishStatus } from "@prisma/client";

const MAX_SNAPSHOTS = 20;

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

async function captureMetrics(userId: string) {
  const [
    totalPosts,
    publishedPosts,
    failedPosts,
    scheduledPosts,
    draftPosts,
    allPublishResults,
    connectedAccounts,
  ] = await Promise.all([
    prisma.post.count({ where: { userId } }),
    prisma.post.count({ where: { userId, status: PostStatus.PUBLISHED } }),
    prisma.post.count({ where: { userId, status: PostStatus.FAILED } }),
    prisma.post.count({ where: { userId, status: PostStatus.SCHEDULED } }),
    prisma.post.count({ where: { userId, status: PostStatus.DRAFT } }),
    prisma.publishResult.findMany({
      where: { post: { userId } },
      select: { platform: true, status: true },
    }),
    prisma.socialAccount.count({ where: { userId, isActive: true } }),
  ]);

  const totalPublishResults = allPublishResults.length;
  const totalPublished = allPublishResults.filter(
    (r) => r.status === PublishStatus.PUBLISHED
  ).length;
  const overallSuccessRate =
    totalPublishResults > 0
      ? Math.round((totalPublished / totalPublishResults) * 100)
      : 0;

  const platformBreakdown = Object.values(Platform).map((platform) => {
    const results = allPublishResults.filter((r) => r.platform === platform);
    return {
      platform,
      published: results.filter((r) => r.status === PublishStatus.PUBLISHED).length,
      failed: results.filter((r) => r.status === PublishStatus.FAILED).length,
      total: results.length,
    };
  }).filter((p) => p.total > 0);

  return {
    posts: { total: totalPosts, published: publishedPosts, failed: failedPosts, scheduled: scheduledPosts, draft: draftPosts },
    publishResults: { total: totalPublishResults, published: totalPublished, overallSuccessRate },
    platformBreakdown,
    connectedAccounts,
    takenAt: new Date().toISOString(),
  };
}

// ── GET /api/analytics/snapshots ─────────────────────────────────────────────

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

    const snapshots = await prisma.analyticsSnapshot.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, data: true, createdAt: true },
    });

    return NextResponse.json({ snapshots });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/analytics/snapshots ────────────────────────────────────────────

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

    const body: unknown = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const count = await prisma.analyticsSnapshot.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_SNAPSHOTS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_SNAPSHOTS} snapshots reached` },
        { status: 422 }
      );
    }

    const data = await captureMetrics(session.user.id);

    const snapshot = await prisma.analyticsSnapshot.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        data,
      },
      select: { id: true, name: true, data: true, createdAt: true },
    });

    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
