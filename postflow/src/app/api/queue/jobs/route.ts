import { type NextRequest, NextResponse } from "next/server";
import { Queue, type JobState } from "bullmq";
import { z } from "zod";
import { auth } from "@/auth";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createRedisConnection, QUEUE_NAMES } from "@/lib/queue/connection";

export interface QueueJob {
  id: string;
  state: string;
  postId: string | null;
  platform: string | null;
  attemptsMade: number;
  timestamp: number;
  failedReason?: string;
}

export interface QueueJobsResponse {
  jobs: QueueJob[];
}

const VALID_STATES = ["waiting", "active", "failed", "delayed"] as const;
type ValidState = (typeof VALID_STATES)[number];

const querySchema = z.object({
  state: z.enum(VALID_STATES).optional(),
});

// ── GET /api/queue/jobs ──────────────────────────────────────────────────────

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
      state: request.nextUrl.searchParams.get("state") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid state parameter" },
        { status: 400 }
      );
    }

    const { state } = parsed.data;
    const userId = session.user.id;
    const jobs: QueueJob[] = [];

    try {
      const queue = new Queue(QUEUE_NAMES.PUBLISH, {
        connection: createRedisConnection(),
      });

      const statesToFetch: JobState[] = state
        ? [state as JobState]
        : (VALID_STATES as unknown as JobState[]);

      for (const s of statesToFetch) {
        const fetched = await queue.getJobs([s], 0, 49);
        for (const job of fetched) {
          if (!job.data || job.data.userId !== userId) continue;
          jobs.push({
            id: job.id ?? "",
            state: s,
            postId: job.data.postId ?? null,
            platform: job.data.platform ?? null,
            attemptsMade: job.attemptsMade ?? 0,
            timestamp: job.timestamp ?? Date.now(),
            failedReason: job.failedReason ?? undefined,
          });
        }
      }

      await queue.close();
    } catch {
      // Redis unavailable — return empty list
    }

    // Sort by timestamp desc, cap at 50
    jobs.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({ jobs: jobs.slice(0, 50) });
  } catch (err) {
    return handleRouteError(err);
  }
}
