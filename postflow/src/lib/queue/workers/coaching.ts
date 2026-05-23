import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { workerLogger } from "@/lib/logger";
import {
  generatePerformanceCoaching,
  type CoachingMetrics,
  type CoachingGoal,
} from "@/lib/ai";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface CoachingScanJobData {
  triggeredAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getWeekStart(from: Date): Date {
  const day = from.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(from);
  monday.setUTCDate(from.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

async function buildCoachingDataForUser(
  userId: string,
  since: Date,
  weekOf: Date
): Promise<{ metrics: CoachingMetrics; goals: CoachingGoal[]; recentInsights: { platform: string; likes: number; comments: number; shares: number; reach: number }[] }> {
  const [publishResults, goalRows] = await Promise.all([
    prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: "PUBLISHED",
        publishedAt: { gte: since },
      },
      include: {
        post: { select: { content: true } },
        insights: true,
      },
    }),
    prisma.postingGoal.findMany({
      where: { userId, isActive: true },
      select: { name: true, period: true, targetCount: true },
    }),
  ]);

  const postsPublished = new Set(publishResults.map((r) => r.postId)).size;

  type ScoredPost = {
    postId: string;
    content: string;
    score: number;
    platform: string;
    likes: number;
    comments: number;
    shares: number;
    reach: number;
  };

  const scoredPosts: ScoredPost[] = publishResults.map((r) => {
    const ins = r.insights;
    const score = ins
      ? ins.likes * 3 + ins.comments * 5 + ins.shares * 4 + ins.reach * 1 + ins.impressions * 0.5
      : 0;
    return {
      postId: r.postId,
      content: r.post.content,
      score,
      platform: r.platform,
      likes: ins?.likes ?? 0,
      comments: ins?.comments ?? 0,
      shares: ins?.shares ?? 0,
      reach: ins?.reach ?? 0,
    };
  });

  const avgEngagementScore =
    scoredPosts.length > 0
      ? scoredPosts.reduce((s, p) => s + p.score, 0) / scoredPosts.length
      : 0;

  const sorted = [...scoredPosts].sort((a, b) => b.score - a.score);
  const topPost = sorted[0] ? { content: sorted[0].content, score: sorted[0].score } : null;
  const bottomPost =
    sorted.length > 1 ? { content: sorted[sorted.length - 1].content, score: sorted[sorted.length - 1].score } : null;

  const metrics: CoachingMetrics = { postsPublished, avgEngagementScore, topPost, bottomPost };

  const goals: CoachingGoal[] = await Promise.all(
    goalRows.map(async (g) => {
      let periodStart = new Date();
      if (g.period === "DAILY") {
        periodStart = new Date();
        periodStart.setUTCHours(0, 0, 0, 0);
      } else if (g.period === "WEEKLY") {
        periodStart = weekOf;
      } else {
        periodStart = new Date();
        periodStart.setUTCDate(1);
        periodStart.setUTCHours(0, 0, 0, 0);
      }

      const count = await prisma.publishResult.count({
        where: {
          post: { userId },
          status: "PUBLISHED",
          publishedAt: { gte: periodStart },
        },
      });

      return {
        name: g.name,
        period: g.period,
        targetCount: g.targetCount,
        publishedCount: count,
        onTrack: count >= g.targetCount,
      };
    })
  );

  const platformMap = new Map<string, { likes: number; comments: number; shares: number; reach: number }>();
  for (const p of scoredPosts) {
    const existing = platformMap.get(p.platform) ?? { likes: 0, comments: 0, shares: 0, reach: 0 };
    platformMap.set(p.platform, {
      likes: existing.likes + p.likes,
      comments: existing.comments + p.comments,
      shares: existing.shares + p.shares,
      reach: existing.reach + p.reach,
    });
  }
  const recentInsights = Array.from(platformMap.entries()).map(([platform, data]) => ({
    platform,
    ...data,
  }));

  return { metrics, goals, recentInsights };
}

// ── Worker ─────────────────────────────────────────────────────────────────────

export function createCoachingWorker(): Worker<CoachingScanJobData> {
  return new Worker<CoachingScanJobData>(
    QUEUE_NAMES.COACHING_SCAN,
    async (job: Job<CoachingScanJobData>) => {
      workerLogger.info({ jobId: job.id }, "Coaching scan started");

      if (!process.env.ANTHROPIC_API_KEY) {
        workerLogger.info("AI not configured, skipping coaching scan");
        return;
      }

      const now = new Date(job.data.triggeredAt);
      const weekOf = getWeekStart(now);
      const since = new Date(weekOf.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Find users with at least 3 published posts in the past 7 days
      const activeUsers = await prisma.user.findMany({
        where: {
          posts: {
            some: {
              publishResults: {
                some: {
                  status: "PUBLISHED",
                  publishedAt: { gte: since },
                },
              },
            },
          },
        },
        select: { id: true },
      });

      let generated = 0;
      let skipped = 0;

      for (const user of activeUsers) {
        try {
          const publishCount = await prisma.publishResult.count({
            where: {
              post: { userId: user.id },
              status: "PUBLISHED",
              publishedAt: { gte: since },
            },
          });

          if (publishCount < 3) {
            skipped++;
            continue;
          }

          const { metrics, goals, recentInsights } = await buildCoachingDataForUser(
            user.id,
            since,
            weekOf
          );

          const result = await generatePerformanceCoaching(metrics, goals, recentInsights);
          if (!result) {
            skipped++;
            continue;
          }

          await prisma.coachingInsight.create({
            data: {
              userId: user.id,
              weekOf,
              summary: result.summary,
              highlights: result.highlights,
              improvements: result.improvements,
              nextWeekFocus: result.nextWeekFocus,
              overallScore: result.overallScore,
            },
          });

          generated++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          workerLogger.error({ err: message, userId: user.id }, "Failed to generate coaching for user");
        }
      }

      workerLogger.info({ generated, skipped }, "Coaching scan completed");
    },
    { connection: createRedisConnection() }
  );
}
