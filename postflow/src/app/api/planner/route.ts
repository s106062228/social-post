import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { GoalPeriod, PostStatus, PublishStatus } from "@prisma/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Given any date, return the Monday of that ISO week (Mon–Sun) at 00:00:00 UTC.
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  // getDay(): 0=Sun, 1=Mon, …, 6=Sat
  const dayOfWeek = d.getUTCDay();
  // Days to subtract to reach Monday (0=Mon offset)
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ── GET /api/planner ──────────────────────────────────────────────────────────

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

    const { searchParams } = new URL(request.url);
    const weekOfParam = searchParams.get("weekOf");

    // Parse weekOf or default to today
    let anchorDate: Date;
    if (weekOfParam && /^\d{4}-\d{2}-\d{2}$/.test(weekOfParam)) {
      const parsed = new Date(`${weekOfParam}T00:00:00Z`);
      anchorDate = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
      anchorDate = new Date();
    }

    const weekStart = getWeekStart(anchorDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    // Fetch all posts scheduled within the week
    const posts = await prisma.post.findMany({
      where: {
        userId: session.user.id,
        scheduledAt: {
          gte: weekStart,
          lte: weekEnd,
        },
        status: {
          in: [PostStatus.SCHEDULED, PostStatus.PUBLISHED, PostStatus.PUBLISHING, PostStatus.PARTIALLY_PUBLISHED, PostStatus.FAILED],
        },
        archivedAt: null,
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        content: true,
        status: true,
        mediaType: true,
        scheduledAt: true,
        publishResults: {
          select: {
            platform: true,
          },
        },
      },
    });

    // Fetch active posting goals for this user
    const goals = await prisma.postingGoal.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
        period: { in: [GoalPeriod.DAILY, GoalPeriod.WEEKLY] },
      },
      select: {
        id: true,
        period: true,
        targetCount: true,
        platform: true,
      },
    });

    const dailyGoals = goals.filter((g) => g.period === GoalPeriod.DAILY);
    const weeklyGoals = goals.filter((g) => g.period === GoalPeriod.WEEKLY);

    // Count PUBLISHED posts for the whole week (for weekly goal)
    const weeklyPublishedCount = await prisma.publishResult.count({
      where: {
        post: {
          userId: session.user.id,
          scheduledAt: { gte: weekStart, lte: weekEnd },
        },
        status: PublishStatus.PUBLISHED,
      },
    });

    // Build weekly goal summary (use first active weekly goal)
    let weeklyGoalSummary: { target: number; achieved: number; onTrack: boolean } | null = null;
    if (weeklyGoals.length > 0) {
      const wg = weeklyGoals[0];
      weeklyGoalSummary = {
        target: wg.targetCount,
        achieved: weeklyPublishedCount,
        onTrack: weeklyPublishedCount >= wg.targetCount,
      };
    }

    // Build the 7-day structure (Mon=0 … Sun=6)
    const days = await Promise.all(
      Array.from({ length: 7 }, async (_, i) => {
        const dayDate = new Date(weekStart);
        dayDate.setUTCDate(weekStart.getUTCDate() + i);
        const dayStart = new Date(dayDate);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(dayDate);
        dayEnd.setUTCHours(23, 59, 59, 999);

        // Filter posts for this day
        const dayPosts = posts
          .filter((p) => p.scheduledAt && p.scheduledAt >= dayStart && p.scheduledAt <= dayEnd)
          .map((p) => ({
            id: p.id,
            content: p.content,
            status: p.status,
            mediaType: p.mediaType,
            scheduledAt: p.scheduledAt!.toISOString(),
            platforms: p.publishResults.map((r) => r.platform),
          }));

        // Daily goal: count PUBLISHED publish results for this day
        let dailyGoalSummary: { target: number; achieved: number; onTrack: boolean } | null = null;
        if (dailyGoals.length > 0) {
          const dg = dailyGoals[0];
          const dailyAchieved = await prisma.publishResult.count({
            where: {
              post: {
                userId: session.user.id,
                scheduledAt: { gte: dayStart, lte: dayEnd },
              },
              status: PublishStatus.PUBLISHED,
            },
          });
          dailyGoalSummary = {
            target: dg.targetCount,
            achieved: dailyAchieved,
            onTrack: dailyAchieved >= dg.targetCount,
          };
        }

        return {
          date: toDateString(dayDate),
          dayOfWeek: DAY_NAMES[i],
          posts: dayPosts,
          dailyGoal: dailyGoalSummary,
          weeklyGoal: weeklyGoalSummary,
        };
      })
    );

    return NextResponse.json({
      weekStart: toDateString(weekStart),
      weekEnd: toDateString(weekEnd),
      days,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
