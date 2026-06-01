import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLogger } from "@/lib/logger";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { generateAtomFeed } from "@/lib/rss-feed";
import { PostStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    let userId: string | undefined;
    let authorName = "PostFlow User";

    // Auth via session
    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
      authorName = session.user.name ?? session.user.email ?? authorName;
    } else {
      // Auth via ?token= query param
      const token = req.nextUrl.searchParams.get("token");
      if (token) {
        const feedToken = await prisma.feedToken.findUnique({
          where: { token },
          select: { userId: true },
        });
        if (feedToken) {
          userId = feedToken.userId;
        }
      }
    }

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const rl = await apiLimiter(userId);
    if (!rl.success) {
      return new NextResponse("Rate limit exceeded", {
        status: 429,
        headers: rateLimitHeaders(rl),
      });
    }

    // Fetch author name if not from session
    if (!session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      authorName = user?.name ?? user?.email ?? authorName;
    }

    // Fetch last 50 published posts
    const posts = await prisma.post.findMany({
      where: { userId, status: PostStatus.PUBLISHED },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        publishResults: {
          where: { status: "PUBLISHED" },
          select: { publishedAt: true, platform: true },
          take: 1,
        },
      },
    });

    const feedUrl = `${req.nextUrl.origin}/api/feed/atom`;
    const atomPosts = posts.map((p) => ({
      id: p.id,
      content: p.content,
      status: p.status as string,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      publishedAt: p.publishResults[0]?.publishedAt ?? undefined,
      platforms: [
        ...new Set(
          p.publishResults.map((r) => r.platform as string)
        ),
      ],
    }));

    const xml = generateAtomFeed(atomPosts, authorName, feedUrl);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        ...rateLimitHeaders(rl),
        "Content-Type": "application/atom+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    apiLogger.error({ error }, "feed atom GET error");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
