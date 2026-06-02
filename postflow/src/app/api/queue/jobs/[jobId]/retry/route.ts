import { type NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import { auth } from "@/auth";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createRedisConnection, QUEUE_NAMES } from "@/lib/queue/connection";

// ── POST /api/queue/jobs/[jobId]/retry ───────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
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

    const { jobId } = await params;
    const userId = session.user.id;

    const queue = new Queue(QUEUE_NAMES.PUBLISH, {
      connection: createRedisConnection(),
    });

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        await queue.close();
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      if (job.data?.userId !== userId) {
        await queue.close();
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await job.retry();
      await queue.close();
    } catch (err) {
      await queue.close().catch(() => {});
      throw err;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
