import { prisma as defaultPrisma } from "@/lib/db";
import { computeScore } from "@/lib/content-score";

type DbClient = typeof defaultPrisma;

export const ACHIEVEMENT_TYPES = {
  FIRST_POST: {
    label: "First Post",
    description: "Created your first post",
    icon: "🌟",
  },
  TEN_POSTS: {
    label: "10 Posts",
    description: "Created 10 posts",
    icon: "📝",
  },
  FIFTY_POSTS: {
    label: "50 Posts",
    description: "Created 50 posts",
    icon: "📊",
  },
  HUNDRED_POSTS: {
    label: "100 Posts",
    description: "Created 100 posts",
    icon: "💯",
  },
  FIRST_PUBLISH: {
    label: "First Published",
    description: "Successfully published your first post",
    icon: "🚀",
  },
  FIRST_SCHEDULE: {
    label: "First Scheduled",
    description: "Scheduled your first post",
    icon: "⏰",
  },
  MULTI_PLATFORM: {
    label: "Multi-Platform",
    description: "Published to 3 or more platforms",
    icon: "🌐",
  },
  CONSISTENT_POSTER: {
    label: "Consistent Poster",
    description: "Published 7 or more posts in the last 7 days",
    icon: "🔄",
  },
  HIGH_ENGAGER: {
    label: "High Engager",
    description: "Achieved a content score above 50 on a post",
    icon: "🔥",
  },
  FIRST_CAMPAIGN: {
    label: "Campaign Creator",
    description: "Created your first campaign",
    icon: "📣",
  },
} as const;

export type AchievementType = keyof typeof ACHIEVEMENT_TYPES;

export async function checkAndAwardAchievements(
  userId: string,
  db: DbClient = defaultPrisma
): Promise<string[]> {
  try {
    const [
      postCount,
      publishedCount,
      scheduledCount,
      publishedPlatforms,
      recentPublishedCount,
      topInsights,
      campaignCount,
      existingAchievements,
    ] = await Promise.all([
      db.post.count({ where: { userId } }),
      db.post.count({
        where: { userId, status: "PUBLISHED" },
      }),
      db.post.count({
        where: { userId, status: "SCHEDULED" },
      }),
      db.publishResult.findMany({
        where: {
          post: { userId },
          status: "PUBLISHED",
        },
        select: { platform: true },
        distinct: ["platform"],
      }),
      db.post.count({
        where: {
          userId,
          status: "PUBLISHED",
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      db.postInsights.findMany({
        where: {
          publishResult: {
            post: { userId },
          },
        },
        select: {
          impressions: true,
          reach: true,
          likes: true,
          comments: true,
          shares: true,
        },
      }),
      db.campaign.count({ where: { userId } }),
      db.achievement.findMany({
        where: { userId },
        select: { type: true },
      }),
    ]);

    const earned = new Set(existingAchievements.map((a: { type: string }) => a.type));

    const platformCount = publishedPlatforms.length;

    const topScore = topInsights.reduce((max: number, ins: { impressions: number | null; reach: number | null; likes: number | null; comments: number | null; shares: number | null }) => {
      const score = computeScore(ins);
      return score > max ? score : max;
    }, 0);

    const candidates: AchievementType[] = [];

    if (!earned.has("FIRST_POST") && postCount >= 1) candidates.push("FIRST_POST");
    if (!earned.has("TEN_POSTS") && postCount >= 10) candidates.push("TEN_POSTS");
    if (!earned.has("FIFTY_POSTS") && postCount >= 50) candidates.push("FIFTY_POSTS");
    if (!earned.has("HUNDRED_POSTS") && postCount >= 100) candidates.push("HUNDRED_POSTS");
    if (!earned.has("FIRST_PUBLISH") && publishedCount >= 1) candidates.push("FIRST_PUBLISH");
    if (!earned.has("FIRST_SCHEDULE") && scheduledCount >= 1) candidates.push("FIRST_SCHEDULE");
    if (!earned.has("MULTI_PLATFORM") && platformCount >= 3) candidates.push("MULTI_PLATFORM");
    if (!earned.has("CONSISTENT_POSTER") && recentPublishedCount >= 7)
      candidates.push("CONSISTENT_POSTER");
    if (!earned.has("HIGH_ENGAGER") && topScore > 50) candidates.push("HIGH_ENGAGER");
    if (!earned.has("FIRST_CAMPAIGN") && campaignCount >= 1) candidates.push("FIRST_CAMPAIGN");

    if (candidates.length === 0) return [];

    await db.achievement.createMany({
      data: candidates.map((type) => ({ userId, type })),
      skipDuplicates: true,
    });

    return candidates;
  } catch {
    return [];
  }
}
