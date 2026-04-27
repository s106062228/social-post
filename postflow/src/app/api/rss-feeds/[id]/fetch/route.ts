import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { fetchAndParseFeed, RssFetchError } from "@/lib/rss";
import { MediaType, PostStatus } from "@prisma/client";

// ── POST /api/rss-feeds/[id]/fetch ────────────────────────────────────────────
// Manually trigger a fetch for a specific feed (used by the UI "Fetch Now" btn).

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id } = await params;

    const feed = await prisma.rssFeed.findUnique({
      where: { id },
      select: { id: true, userId: true, url: true, autoCreate: true },
    });

    if (!feed || feed.userId !== session.user.id) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    let parsed;
    try {
      parsed = await fetchAndParseFeed(feed.url);
    } catch (err) {
      if (err instanceof RssFetchError) {
        return NextResponse.json(
          { error: `Failed to fetch feed: ${err.message}` },
          { status: 502 }
        );
      }
      throw err;
    }

    let newItemCount = 0;
    let postCount = 0;

    for (const item of parsed.items) {
      const existing = await prisma.rssItem.findUnique({
        where: { feedId_guid: { feedId: feed.id, guid: item.guid } },
        select: { id: true },
      });
      if (existing) continue;

      let postId: string | undefined;

      if (feed.autoCreate && item.content) {
        const content = [
          item.title ? `**${item.title}**\n\n` : "",
          item.content ?? "",
          item.link ? `\n\n${item.link}` : "",
        ]
          .join("")
          .trim()
          .slice(0, 63_206);

        const post = await prisma.post.create({
          data: {
            userId: feed.userId,
            content,
            mediaType: MediaType.NONE,
            mediaUrls: [],
            status: PostStatus.DRAFT,
          },
          select: { id: true },
        });
        postId = post.id;
        postCount++;
      }

      await prisma.rssItem.create({
        data: {
          feedId: feed.id,
          guid: item.guid,
          title: item.title,
          content: item.content,
          link: item.link,
          imageUrl: item.imageUrl,
          publishedAt: item.publishedAt,
          postId,
        },
      });
      newItemCount++;
    }

    await prisma.rssFeed.update({
      where: { id: feed.id },
      data: { lastFetchedAt: new Date() },
    });

    return NextResponse.json({
      newItems: newItemCount,
      postsCreated: postCount,
      totalItems: parsed.items.length,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
