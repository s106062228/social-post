import { type NextResponse } from "next/server";
import { NextResponse as NR } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeQueueHealth, type QueueHealthResult, type ScheduledPost } from "@/lib/queue-health";

export interface QueueHealthResponse extends QueueHealthResult {}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NR.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NR.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const posts = await prisma.post.findMany({
      where: {
        userId: session.user.id,
        status: "SCHEDULED",
      },
      select: {
        scheduledAt: true,
        publishResults: {
          select: { platform: true },
        },
      },
    });

    const scheduledPosts: ScheduledPost[] = posts
      .filter((p) => p.scheduledAt !== null)
      .map((p) => ({
        scheduledAt: p.scheduledAt as Date,
        platforms: p.publishResults.map((r) => r.platform),
      }));

    const result = computeQueueHealth(scheduledPosts);

    return NR.json(result satisfies QueueHealthResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
