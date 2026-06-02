import { type NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import { auth } from "@/auth";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createRedisConnection, QUEUE_NAMES } from "@/lib/queue/connection";

export interface QueueStatusResponse {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

// ── GET /api/queue/status ────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  void request;
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

    let counts: QueueStatusResponse = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
    };

    try {
      const queue = new Queue(QUEUE_NAMES.PUBLISH, {
        connection: createRedisConnection(),
      });
      const raw = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
        "paused"
      );
      counts = {
        waiting: raw.waiting ?? 0,
        active: raw.active ?? 0,
        completed: raw.completed ?? 0,
        failed: raw.failed ?? 0,
        delayed: raw.delayed ?? 0,
        paused: raw.paused ?? 0,
      };
      await queue.close();
    } catch {
      // Redis unavailable — return zero counts
    }

    return NextResponse.json(counts);
  } catch (err) {
    return handleRouteError(err);
  }
}
