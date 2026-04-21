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
import { logActivity } from "@/lib/activity-log";

const postIdSchema = z.string().cuid();

const adapters: Record<Platform, PlatformAdapter> = {
  [Platform.FACEBOOK]: facebookAdapter,
  [Platform.INSTAGRAM]: instagramAdapter,
  [Platform.THREADS]: threadsAdapter,
};

// ── POST /api/posts/[id]/retry ────────────────────────────────────────────────

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        publishResults: {
          where: { status: PublishStatus.FAILED },
        },
      },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (
      post.status !== PostStatus.FAILED &&
      post.status !== PostStatus.PARTIALLY_PUBLISHED
    ) {
      return NextResponse.json(
        { error: "Only failed or partially published posts can be retried" },
        { status: 409 }
      );
    }

    if (post.publishResults.length === 0) {
      return NextResponse.json(
        { error: "No failed publish results to retry" },
        { status: 409 }
      );
    }

    const accountIds = post.publishResults.map((r) => r.accountId);

    const accounts = await prisma.socialAccount.findMany({
      where: {
        id: { in: accountIds },
        userId: session.user.id,
        isActive: true,
      },
    });

    if (accounts.length === 0) {
      return NextResponse.json(
        { error: "No active accounts found for retry" },
        { status: 400 }
      );
    }

    await prisma.post.update({
      where: { id },
      data: { status: PostStatus.PUBLISHING },
    });

    const postContent = {
      content: post.content,
      mediaType: post.mediaType,
      mediaUrls: post.mediaUrls,
      scheduledAt: post.scheduledAt,
    };

    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        await prisma.publishResult.updateMany({
          where: { postId: id, accountId: account.id, status: PublishStatus.FAILED },
          data: { status: PublishStatus.PROCESSING, error: null },
        });

        const token = await getTokenWithRefresh({
          id: account.id,
          encryptedToken: account.encryptedToken,
          tokenExpiresAt: account.tokenExpiresAt,
        });

        const adapter = adapters[account.platform];
        const result = await adapter.publish(
          postContent,
          account.platformAccountId,
          token
        );

        await prisma.publishResult.updateMany({
          where: { postId: id, accountId: account.id },
          data: {
            status: PublishStatus.PUBLISHED,
            platformPostId: result.platformPostId,
            publishedUrl: result.publishedUrl ?? null,
            publishedAt: result.publishedAt,
          },
        });

        return result;
      })
    );

    await Promise.all(
      results.map(async (result, index) => {
        if (result.status === "rejected") {
          const account = accounts[index];
          const errorMessage =
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error";
          await prisma.publishResult.updateMany({
            where: { postId: id, accountId: account.id },
            data: {
              status: PublishStatus.FAILED,
              error: errorMessage,
              retryCount: { increment: 1 },
            },
          });
        }
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    let finalStatus: PostStatus;
    if (succeeded === 0) {
      finalStatus = PostStatus.FAILED;
    } else if (failed > 0) {
      finalStatus = PostStatus.PARTIALLY_PUBLISHED;
    } else {
      finalStatus = PostStatus.PUBLISHED;
    }

    const updatedPost = await prisma.post.update({
      where: { id },
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

    logActivity({
      userId: session.user.id,
      action: "post.retried",
      entityId: id,
      entityType: "post",
      metadata: { succeeded, failed, total: accounts.length, finalStatus },
    });

    const httpStatus = succeeded === 0 ? 500 : failed > 0 ? 207 : 200;
    return NextResponse.json(
      { post: updatedPost, summary: { succeeded, failed, total: accounts.length } },
      { status: httpStatus }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
