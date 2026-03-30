import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform, PostStatus, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getTokenWithRefresh } from "@/lib/auth/token-manager";
import { facebookAdapter } from "@/lib/platforms/facebook";
import { instagramAdapter } from "@/lib/platforms/instagram";
import { threadsAdapter } from "@/lib/platforms/threads";
import type { PlatformAdapter } from "@/lib/platforms/types";
import { handleRouteError } from "@/lib/errors";
import { checkRateLimit, rateLimitExceededResponse, buildRateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

// ── Zod Schema ────────────────────────────────────────────────────────────────

const publishSchema = z.object({
  postId: z.string().cuid(),
  /**
   * Array of social account IDs (from the SocialAccount table) to publish to.
   * Each must belong to the authenticated user.
   */
  accountIds: z.array(z.string().cuid()).min(1),
});

// ── Adapter map ───────────────────────────────────────────────────────────────

const adapters: Record<Platform, PlatformAdapter> = {
  [Platform.FACEBOOK]: facebookAdapter,
  [Platform.INSTAGRAM]: instagramAdapter,
  [Platform.THREADS]: threadsAdapter,
};

// ── POST /api/publish ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let postId: string | undefined;
  let transitionedToPublishing = false;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting: 20 publish calls per minute per user
    const rl = await checkRateLimit(`ratelimit:publish:${session.user.id}`, RATE_LIMITS.publish);
    if (!rl.success) {
      return rateLimitExceededResponse(rl);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { postId: parsedPostId, accountIds } = parsed.data;
    postId = parsedPostId;

    // Fetch the post and verify ownership
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { publishResults: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.status === PostStatus.PUBLISHING) {
      return NextResponse.json(
        { error: "Post is already being published" },
        { status: 409 }
      );
    }

    if (post.status === PostStatus.PUBLISHED) {
      return NextResponse.json(
        { error: "Post has already been published" },
        { status: 409 }
      );
    }

    // Fetch the requested social accounts (must belong to the user and be active)
    const accounts = await prisma.socialAccount.findMany({
      where: {
        id: { in: accountIds },
        userId: session.user.id,
        isActive: true,
      },
    });

    if (accounts.length === 0) {
      return NextResponse.json(
        { error: "No valid social accounts found" },
        { status: 400 }
      );
    }

    // Warn if some requested accounts weren't found, but continue with what we have
    const foundIds = new Set(accounts.map((a) => a.id));
    const missingIds = accountIds.filter((id) => !foundIds.has(id));

    // Transition post to PUBLISHING
    await prisma.post.update({
      where: { id: postId },
      data: { status: PostStatus.PUBLISHING },
    });
    transitionedToPublishing = true;

    // Create pending PublishResult rows
    const publishResultData = accounts.map((account) => ({
      postId: postId as string,
      platform: account.platform,
      accountId: account.id,
      status: PublishStatus.PENDING,
    }));

    await prisma.publishResult.createMany({
      data: publishResultData,
      skipDuplicates: true,
    });

    // Publish to each account concurrently
    const postContent = {
      content: post.content,
      mediaType: post.mediaType,
      mediaUrls: post.mediaUrls,
      scheduledAt: post.scheduledAt,
    };

    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        const adapter = adapters[account.platform];

        // Mark as PROCESSING
        await prisma.publishResult.updateMany({
          where: { postId, accountId: account.id },
          data: { status: PublishStatus.PROCESSING },
        });

        // Get decrypted token (with auto-refresh if needed)
        const token = await getTokenWithRefresh({
          id: account.id,
          encryptedToken: account.encryptedToken,
          tokenExpiresAt: account.tokenExpiresAt,
        });

        const result = await adapter.publish(
          postContent,
          account.platformAccountId,
          token
        );

        // Mark as PUBLISHED
        await prisma.publishResult.updateMany({
          where: { postId, accountId: account.id },
          data: {
            status: PublishStatus.PUBLISHED,
            platformPostId: result.platformPostId,
            publishedUrl: result.publishedUrl ?? null,
            publishedAt: result.publishedAt,
          },
        });

        return { accountId: account.id, platform: account.platform, ...result };
      })
    );

    // Count successes and failures
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // Record errors for failed publishes
    await Promise.all(
      results.map(async (result, index) => {
        if (result.status === "rejected") {
          const account = accounts[index];
          const errorMessage =
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error";

          await prisma.publishResult.updateMany({
            where: { postId, accountId: account.id },
            data: {
              status: PublishStatus.FAILED,
              error: errorMessage,
            },
          });
        }
      })
    );

    // Determine final post status
    let finalStatus: PostStatus;
    if (succeeded === 0) {
      finalStatus = PostStatus.FAILED;
    } else if (failed > 0) {
      finalStatus = PostStatus.PARTIALLY_PUBLISHED;
    } else {
      finalStatus = PostStatus.PUBLISHED;
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: { status: finalStatus },
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
            retryCount: true,
          },
        },
      },
    });

    const response = {
      post: updatedPost,
      summary: {
        succeeded,
        failed,
        total: accounts.length,
        ...(missingIds.length > 0 && { missingAccountIds: missingIds }),
      },
    };

    const httpStatus = succeeded === 0 ? 500 : failed > 0 ? 207 : 200;
    return NextResponse.json(response, {
      status: httpStatus,
      headers: buildRateLimitHeaders(rl),
    });
  } catch (err) {
    // If we already transitioned the post to PUBLISHING, attempt to mark it FAILED
    // so it doesn't get stuck in an unrecoverable state.
    if (transitionedToPublishing && postId) {
      await prisma.post
        .update({
          where: { id: postId },
          data: { status: PostStatus.FAILED },
        })
        .catch((updateErr: unknown) => {
          console.error("[publish] Failed to reset post status after error:", updateErr);
        });
    }

    return handleRouteError(err);
  }
}
