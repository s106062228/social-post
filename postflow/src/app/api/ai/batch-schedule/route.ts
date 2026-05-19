import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { logActivity } from "@/lib/activity-log";
import { getSmartScheduleSuggestions } from "@/lib/smart-schedule";
import { PostStatus } from "@prisma/client";

const batchScheduleSchema = z.object({
  postIds: z.array(z.string().cuid()).min(1).max(50),
  timezone: z.string().default("UTC"),
});

interface ScheduledResult {
  postId: string;
  scheduledAt: string;
  reason: string;
}

interface FailedResult {
  postId: string;
  reason: string;
}

/**
 * Returns the next occurrence of a specific hour (local time) at least 5 minutes from now.
 * Used as fallback when no historical engagement data is available.
 */
function nextDailySlot(
  hour: number,
  daysOffset: number,
  timezone: string
): Date {
  const now = new Date();
  const candidate = new Date(now.getTime() + daysOffset * 86_400_000);

  try {
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(candidate);

    const h = String(hour).padStart(2, "0");
    const naiveUtc = new Date(`${dateStr}T${h}:00:00.000Z`);

    const offsetParts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    }).formatToParts(naiveUtc);
    const offsetStr = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
    let offsetMins = 0;
    if (match) {
      const sign = match[1] === "+" ? 1 : -1;
      offsetMins = sign * (parseInt(match[2], 10) * 60 + parseInt(match[3] ?? "0", 10));
    }

    const result = new Date(naiveUtc.getTime() - offsetMins * 60_000);
    if (result.getTime() > now.getTime() + 5 * 60_000) return result;
  } catch {
    // fall through to UTC fallback
  }

  // UTC fallback
  const d = new Date(now.getTime() + (daysOffset + 1) * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

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

    const parsed = batchScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { postIds, timezone } = parsed.data;
    const userId = session.user.id;

    // Fetch all posts upfront for ownership + status validation
    const posts = await prisma.post.findMany({
      where: { id: { in: postIds } },
      select: { id: true, userId: true, status: true },
    });

    const scheduled: ScheduledResult[] = [];
    const failed: FailedResult[] = [];
    let fallbackDayOffset = 1; // for when no smart suggestions exist

    // Process each post sequentially so each successive smart-schedule query
    // sees previously assigned slots as SCHEDULED in the DB.
    for (const postId of postIds) {
      const post = posts.find((p) => p.id === postId);

      if (!post) {
        failed.push({ postId, reason: "Post not found" });
        continue;
      }

      if (post.userId !== userId) {
        failed.push({ postId, reason: "Forbidden" });
        continue;
      }

      if (post.status !== PostStatus.DRAFT) {
        failed.push({ postId, reason: `Post is ${post.status.toLowerCase()}, not DRAFT` });
        continue;
      }

      try {
        // Try smart schedule first (queries DB including any posts we already scheduled above)
        const suggestions = await getSmartScheduleSuggestions(userId, [], timezone, 1);

        let scheduledAt: Date;
        let reason: string;

        if (suggestions.length > 0) {
          scheduledAt = new Date(suggestions[0].datetime);
          reason = suggestions[0].reason;
        } else {
          // No historical data — fall back to 10 AM local time, spacing by 1 day per post
          scheduledAt = nextDailySlot(10, fallbackDayOffset, timezone);
          reason = "Scheduled at optimal morning time (no engagement history yet)";
          fallbackDayOffset += 1;
        }

        await prisma.post.update({
          where: { id: postId },
          data: { scheduledAt, status: PostStatus.SCHEDULED },
        });

        void logActivity({
          userId,
          action: "post.scheduled",
          entityId: postId,
          entityType: "post",
          metadata: { scheduledAt: scheduledAt.toISOString(), source: "ai_batch" },
        });

        scheduled.push({ postId, scheduledAt: scheduledAt.toISOString(), reason });
      } catch {
        failed.push({ postId, reason: "Failed to compute schedule" });
      }
    }

    return NextResponse.json({ scheduled, failed });
  } catch (err) {
    return handleRouteError(err);
  }
}
