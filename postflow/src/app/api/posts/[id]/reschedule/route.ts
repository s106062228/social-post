import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { checkRateLimit, rateLimitExceededResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { cancelScheduledPublish } from "@/lib/queue/scheduler";

const rescheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
});

// ── POST /api/posts/[id]/reschedule ───────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(
      `ratelimit:postMutate:${session.user.id}`,
      RATE_LIMITS.postMutate
    );
    if (!rl.success) {
      return rateLimitExceededResponse(rl);
    }

    const { id } = await params;

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Only SCHEDULED or DRAFT posts can be rescheduled
    if (
      post.status === PostStatus.PUBLISHING ||
      post.status === PostStatus.PUBLISHED ||
      post.status === PostStatus.PARTIALLY_PUBLISHED
    ) {
      return NextResponse.json(
        { error: "Cannot reschedule a post that is publishing or already published" },
        { status: 409 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = rescheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const newScheduledAt = new Date(parsed.data.scheduledAt);

    if (newScheduledAt <= new Date()) {
      return NextResponse.json(
        { error: "scheduledAt must be in the future" },
        { status: 422 }
      );
    }

    // Cancel any existing delayed BullMQ jobs for pending publish results
    const pendingResults = await prisma.publishResult.findMany({
      where: { postId: id, status: "PENDING" },
      select: { accountId: true },
    });

    await Promise.allSettled(
      pendingResults.map((r) => cancelScheduledPublish(id, r.accountId))
    );

    // Update scheduledAt and reset status to SCHEDULED
    const updated = await prisma.post.update({
      where: { id },
      data: {
        scheduledAt: newScheduledAt,
        status: PostStatus.SCHEDULED,
      },
      include: {
        publishResults: {
          select: {
            id: true,
            platform: true,
            accountId: true,
            status: true,
            platformPostId: true,
            publishedUrl: true,
            publishedAt: true,
            error: true,
          },
        },
      },
    });

    // Re-enqueue delayed jobs with new delay for each pending account
    const delayMs = Math.max(0, newScheduledAt.getTime() - Date.now());
    const { Queue } = await import("bullmq");
    const { createRedisConnection, QUEUE_NAMES } = await import("@/lib/queue/connection");

    const queue = new Queue(QUEUE_NAMES.PUBLISH, {
      connection: createRedisConnection(),
    });

    await Promise.all(
      pendingResults.map(async (r) => {
        const publishResult = await prisma.publishResult.findFirst({
          where: { postId: id, accountId: r.accountId, status: "PENDING" },
          select: { id: true },
        });
        if (!publishResult) return;

        const jobId = `publish:${id}:${r.accountId}`;
        await queue.add(
          jobId,
          { postId: id, accountId: r.accountId, publishResultId: publishResult.id },
          { jobId, delay: delayMs }
        );
      })
    );

    await queue.close();

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}
