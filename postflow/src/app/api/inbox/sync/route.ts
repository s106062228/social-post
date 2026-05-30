import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { getTokenWithRefresh } from "@/lib/auth/token-manager";
import { facebookAdapter } from "@/lib/platforms/facebook";
import { instagramAdapter } from "@/lib/platforms/instagram";
import type { PlatformAdapter } from "@/lib/platforms/types";

// Only platforms that support fetchComments
const commentAdapters: Partial<Record<Platform, PlatformAdapter>> = {
  [Platform.FACEBOOK]: facebookAdapter,
  [Platform.INSTAGRAM]: instagramAdapter,
};

const syncSchema = z.object({
  platformPostIds: z.array(z.string()).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await apiLimiter(userId, { limit: 10, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    // Get user's active accounts that support comment fetching
    const supportedPlatforms = Object.keys(commentAdapters) as Platform[];
    const accounts = await prisma.socialAccount.findMany({
      where: { userId, isActive: true, platform: { in: supportedPlatforms } },
    });

    if (accounts.length === 0) {
      return NextResponse.json({ synced: 0, platforms: [] });
    }

    // Get recently published posts (up to 20)
    const publishResults = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: "PUBLISHED",
        platformPostId: { not: null },
        platform: { in: supportedPlatforms },
        ...(parsed.data.platformPostIds
          ? { platformPostId: { in: parsed.data.platformPostIds } }
          : {}),
      },
      select: {
        id: true,
        platformPostId: true,
        platform: true,
        accountId: true,
      },
      orderBy: { publishedAt: "desc" },
      take: 20,
    });

    let synced = 0;
    const platformsUsed = new Set<string>();

    for (const result of publishResults) {
      if (!result.platformPostId) continue;
      const account = accounts.find((a) => a.id === result.accountId);
      if (!account) continue;

      const adapter = commentAdapters[result.platform];
      if (!adapter?.fetchComments) continue;

      try {
        const token = await getTokenWithRefresh(account);
        const comments = await adapter.fetchComments(
          result.platformPostId,
          token
        );

        for (const comment of comments) {
          await prisma.socialComment.upsert({
            where: { platformCommentId: comment.platformCommentId },
            create: {
              userId,
              accountId: account.id,
              platformPostId: result.platformPostId,
              platformCommentId: comment.platformCommentId,
              authorName: comment.authorName,
              authorHandle: comment.authorHandle,
              authorAvatarUrl: comment.authorAvatarUrl,
              content: comment.content,
              platform: result.platform,
              postedAt: comment.postedAt,
            },
            update: {
              content: comment.content,
              fetchedAt: new Date(),
            },
          });
          synced++;
        }
        platformsUsed.add(result.platform);
      } catch {
        // Skip failed accounts silently
      }
    }

    return NextResponse.json({
      synced,
      platforms: Array.from(platformsUsed),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
