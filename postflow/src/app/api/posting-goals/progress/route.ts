import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { GoalPeriod, Platform, PublishStatus } from "@prisma/client";

function getPeriodWindow(period: GoalPeriod): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);

  if (period === GoalPeriod.DAILY) {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  if (period === GoalPeriod.WEEKLY) {
    const from = new Date(now);
    const day = from.getDay(); // 0=Sun
    from.setDate(from.getDate() - day);
    from.setHours(0, 0, 0, 0);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  // MONTHLY
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to: toDate };
}

// ── GET /api/posting-goals/progress ──────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
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

    const goals = await prisma.postingGoal.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    const progress = await Promise.all(
      goals.map(async (goal) => {
        const { from, to } = getPeriodWindow(goal.period);

        const platformFilter: { platform?: Platform } = {};
        if (goal.platform) {
          platformFilter.platform = goal.platform;
        }

        const publishedCount = await prisma.publishResult.count({
          where: {
            post: { userId: session.user.id },
            status: PublishStatus.PUBLISHED,
            publishedAt: { gte: from, lte: to },
            ...platformFilter,
          },
        });

        const percentage = Math.min(
          100,
          Math.round((publishedCount / goal.targetCount) * 100)
        );
        const onTrack = publishedCount >= goal.targetCount;

        return {
          goalId: goal.id,
          name: goal.name,
          period: goal.period,
          platform: goal.platform,
          targetCount: goal.targetCount,
          publishedCount,
          percentage,
          onTrack,
        };
      })
    );

    return NextResponse.json({ progress });
  } catch (err) {
    return handleRouteError(err);
  }
}
