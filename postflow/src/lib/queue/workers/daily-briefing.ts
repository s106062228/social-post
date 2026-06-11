import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { workerLogger } from "@/lib/logger";
import { generateDailyBriefing, type DailyBriefingData } from "@/lib/ai";
import { extractHashtags } from "@/lib/hashtag-analytics";

export interface DailyBriefingJobData {
  triggeredAt: string;
}

function dateStringUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createDailyBriefingWorker(): Worker<DailyBriefingJobData> {
  return new Worker<DailyBriefingJobData>(
    QUEUE_NAMES.DAILY_BRIEFING,
    async (job: Job<DailyBriefingJobData>) => {
      workerLogger.info({ jobId: job.id }, "Daily briefing scan started");

      if (!process.env.ANTHROPIC_API_KEY) {
        workerLogger.info("AI not configured, skipping daily briefing scan");
        return;
      }

      const now = new Date(job.data.triggeredAt);
      const today = dateStringUTC(now);
      const yesterday = dateStringUTC(new Date(now.getTime() - 24 * 60 * 60 * 1000));

      const todayStart = new Date(`${today}T00:00:00.000Z`);
      const todayEnd = new Date(`${today}T23:59:59.999Z`);
      const yesterdayStart = new Date(`${yesterday}T00:00:00.000Z`);
      const yesterdayEnd = new Date(`${yesterday}T23:59:59.999Z`);
      const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Find all users with active accounts
      const users = await prisma.user.findMany({
        where: {
          socialAccounts: { some: { isActive: true } },
          emailNotifications: true,
        },
        select: { id: true },
      });

      let generated = 0;
      let skipped = 0;

      for (const user of users) {
        try {
          const [
            todayScheduled,
            weekScheduled,
            yesterdayResults,
            scheduledDates,
            recentPosts,
          ] = await Promise.all([
            prisma.post.count({
              where: {
                userId: user.id,
                status: { in: ["SCHEDULED", "PUBLISHING"] },
                scheduledAt: { gte: todayStart, lte: todayEnd },
              },
            }),
            prisma.post.count({
              where: {
                userId: user.id,
                status: { in: ["SCHEDULED", "PUBLISHING"] },
                scheduledAt: { gte: todayStart, lte: weekEnd },
              },
            }),
            prisma.publishResult.findMany({
              where: {
                post: { userId: user.id },
                status: "PUBLISHED",
                publishedAt: { gte: yesterdayStart, lte: yesterdayEnd },
              },
              include: { insights: true },
            }),
            prisma.post.findMany({
              where: {
                userId: user.id,
                status: { in: ["SCHEDULED", "PUBLISHING"] },
                scheduledAt: { gte: todayStart, lte: weekEnd },
              },
              select: { scheduledAt: true },
            }),
            prisma.post.findMany({
              where: {
                userId: user.id,
                status: "PUBLISHED",
                updatedAt: { gte: thirtyDaysAgo },
              },
              select: { content: true },
              take: 100,
            }),
          ]);

          const yesterdayPublished = new Set(yesterdayResults.map((r: (typeof yesterdayResults)[0]) => r.postId)).size;
          let totalEngagement = 0;
          const platformEngagement: Record<string, number> = {};

          for (const r of yesterdayResults) {
            if (r.insights) {
              const eng = r.insights.likes + r.insights.comments + r.insights.shares;
              totalEngagement += eng;
              platformEngagement[r.platform] = (platformEngagement[r.platform] ?? 0) + eng;
            }
          }

          const topPlatform =
            Object.keys(platformEngagement).length > 0
              ? Object.entries(platformEngagement).sort((a, b) => b[1] - a[1])[0][0]
              : null;

          const scheduledDaySet = new Set(
            scheduledDates
              .filter((p: (typeof scheduledDates)[0]) => p.scheduledAt)
              .map((p: (typeof scheduledDates)[0]) => p.scheduledAt!.toISOString().slice(0, 10))
          );

          const contentGaps: string[] = [];
          for (let i = 1; i <= 7; i++) {
            const d = new Date(todayStart.getTime() + i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().slice(0, 10);
            if (!scheduledDaySet.has(dateStr)) {
              contentGaps.push(dateStr);
            }
          }

          const hashtagCounts: Record<string, number> = {};
          for (const post of recentPosts) {
            const tags = extractHashtags(post.content);
            for (const tag of tags) {
              hashtagCounts[tag] = (hashtagCounts[tag] ?? 0) + 1;
            }
          }

          const topHashtags = Object.entries(hashtagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tag, count]) => ({ tag, count }));

          const briefingData: DailyBriefingData = {
            todayScheduled,
            weekScheduled,
            yesterdayStats: {
              published: yesterdayPublished,
              totalEngagement,
              topPlatform,
            },
            contentGaps: contentGaps.slice(0, 5),
            topHashtags,
          };

          const result = await generateDailyBriefing(briefingData);
          if (!result) {
            skipped++;
            continue;
          }

          await prisma.dailyBriefing.upsert({
            where: { userId_date: { userId: user.id, date: today } },
            create: {
              userId: user.id,
              date: today,
              todayScheduled,
              weekScheduled,
              yesterdayStats: briefingData.yesterdayStats,
              contentGaps,
              topHashtags,
              summary: result.summary,
              recommendations: result.recommendations,
            },
            update: {
              todayScheduled,
              weekScheduled,
              yesterdayStats: briefingData.yesterdayStats,
              contentGaps,
              topHashtags,
              summary: result.summary,
              recommendations: result.recommendations,
              generatedAt: new Date(),
            },
          });

          generated++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          workerLogger.error(
            { err: message, userId: user.id },
            "Failed to generate daily briefing for user"
          );
        }
      }

      workerLogger.info({ generated, skipped }, "Daily briefing scan completed");
    },
    { connection: createRedisConnection() }
  );
}
