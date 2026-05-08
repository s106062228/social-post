import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getTokenWithRefresh } from "@/lib/auth/token-manager";
import { facebookAdapter } from "@/lib/platforms/facebook";
import { instagramAdapter } from "@/lib/platforms/instagram";
import { threadsAdapter } from "@/lib/platforms/threads";
import { linkedInAdapter } from "@/lib/platforms/linkedin";
import { pinterestAdapter } from "@/lib/platforms/pinterest";
import { youTubeAdapter } from "@/lib/platforms/youtube";
import { tikTokAdapter } from "@/lib/platforms/tiktok";
import { twitterAdapter } from "@/lib/platforms/twitter";
import { blueskyAdapter } from "@/lib/platforms/bluesky";
import { mastodonAdapter } from "@/lib/platforms/mastodon";
import { telegramAdapter } from "@/lib/platforms/telegram";
import { redditAdapter } from "@/lib/platforms/reddit";
import { nostrAdapter } from "@/lib/platforms/nostr";
import { tumblrAdapter } from "@/lib/platforms/tumblr";
import { wordpressAdapter } from "@/lib/platforms/wordpress";
import { mediumAdapter } from "@/lib/platforms/medium";
import { ghostAdapter } from "@/lib/platforms/ghost";
import { devtoAdapter } from "@/lib/platforms/devto";
import { hashnodeAdapter } from "@/lib/platforms/hashnode";
import type { PlatformAdapter } from "@/lib/platforms/types";
import { handleRouteError } from "@/lib/errors";

const postIdSchema = z.string().cuid();

const adapters: Record<Platform, PlatformAdapter> = {
  [Platform.FACEBOOK]: facebookAdapter,
  [Platform.INSTAGRAM]: instagramAdapter,
  [Platform.THREADS]: threadsAdapter,
  [Platform.LINKEDIN]: linkedInAdapter,
  [Platform.PINTEREST]: pinterestAdapter,
  [Platform.YOUTUBE]: youTubeAdapter,
  [Platform.TIKTOK]: tikTokAdapter,
  [Platform.TWITTER]: twitterAdapter,
  [Platform.BLUESKY]: blueskyAdapter,
  [Platform.MASTODON]: mastodonAdapter,
  [Platform.TELEGRAM]: telegramAdapter,
  [Platform.REDDIT]: redditAdapter,
  [Platform.NOSTR]: nostrAdapter,
  [Platform.TUMBLR]: tumblrAdapter,
  [Platform.WORDPRESS]: wordpressAdapter,
  [Platform.MEDIUM]: mediumAdapter,
  [Platform.GHOST]: ghostAdapter,
  [Platform.DEVTO]: devtoAdapter,
  [Platform.HASHNODE]: hashnodeAdapter,
};

// ── GET /api/posts/[id]/insights ──────────────────────────────────────────────

export async function GET(
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
      select: { userId: true },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const results = await prisma.publishResult.findMany({
      where: { postId: id, status: PublishStatus.PUBLISHED },
      include: { insights: true },
    });

    const perPlatform = results.map((r) => ({
      platform: r.platform,
      publishResultId: r.id,
      platformPostId: r.platformPostId,
      publishedUrl: r.publishedUrl,
      publishedAt: r.publishedAt,
      insights: r.insights
        ? {
            impressions: r.insights.impressions,
            reach: r.insights.reach,
            likes: r.insights.likes,
            comments: r.insights.comments,
            shares: r.insights.shares,
            syncedAt: r.insights.syncedAt,
          }
        : null,
    }));

    const totals = {
      impressions: sum(results.map((r) => r.insights?.impressions)),
      reach: sum(results.map((r) => r.insights?.reach)),
      likes: sum(results.map((r) => r.insights?.likes)),
      comments: sum(results.map((r) => r.insights?.comments)),
      shares: sum(results.map((r) => r.insights?.shares)),
    };

    return NextResponse.json({ perPlatform, totals });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/posts/[id]/insights (sync) ──────────────────────────────────────

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
      select: { userId: true },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const publishResults = await prisma.publishResult.findMany({
      where: { postId: id, status: PublishStatus.PUBLISHED },
      select: {
        id: true,
        platform: true,
        accountId: true,
        platformPostId: true,
      },
    });

    if (publishResults.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0 });
    }

    const accountIds = [...new Set(publishResults.map((r) => r.accountId))];
    const accounts = await prisma.socialAccount.findMany({
      where: { id: { in: accountIds }, isActive: true },
      select: { id: true, encryptedToken: true, tokenExpiresAt: true },
    });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    let synced = 0;
    let skipped = 0;

    await Promise.allSettled(
      publishResults.map(async (result) => {
        if (!result.platformPostId) {
          skipped++;
          return;
        }
        const account = accountMap.get(result.accountId);
        if (!account) {
          skipped++;
          return;
        }

        try {
          const token = await getTokenWithRefresh({
            id: result.accountId,
            encryptedToken: account.encryptedToken,
            tokenExpiresAt: account.tokenExpiresAt,
          });

          const adapter = adapters[result.platform];
          const raw = await adapter.getInsights(result.platformPostId, token);

          await prisma.postInsights.upsert({
            where: { publishResultId: result.id },
            update: {
              impressions: raw.impressions ?? null,
              reach: raw.reach ?? null,
              likes: raw.likes ?? null,
              comments: raw.comments ?? null,
              shares: raw.shares ?? null,
              syncedAt: new Date(),
            },
            create: {
              publishResultId: result.id,
              impressions: raw.impressions ?? null,
              reach: raw.reach ?? null,
              likes: raw.likes ?? null,
              comments: raw.comments ?? null,
              shares: raw.shares ?? null,
            },
          });

          synced++;
        } catch {
          skipped++;
        }
      })
    );

    return NextResponse.json({ synced, skipped });
  } catch (err) {
    return handleRouteError(err);
  }
}

function sum(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v !== null && v !== undefined);
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null;
}
