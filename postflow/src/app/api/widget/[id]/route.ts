import { type NextRequest, NextResponse } from "next/server";
import { Redis } from "ioredis";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

const CACHE_TTL_SECONDS = 300; // 5 minutes

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis) {
    redis = new Redis(url, { lazyConnect: true, enableReadyCheck: false });
  }
  return redis;
}

function cacheKey(widgetId: string): string {
  return `widget:${widgetId}`;
}

type Params = { params: Promise<{ id: string }> };

// ── GET /api/widget/[id] ─────────────────────────────────────────────────────
// Public endpoint — no auth required. Returns sanitized published posts.

export async function GET(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const { id } = await params;

    const client = getRedis();

    // Try cache first
    if (client) {
      try {
        const cached = await client.get(cacheKey(id));
        if (cached) {
          const data = JSON.parse(cached) as unknown;
          return NextResponse.json(data, {
            headers: { "Cache-Control": "public, max-age=300" },
          });
        }
      } catch {
        // Ignore Redis errors; fall through to DB
      }
    }

    const widget = await prisma.feedWidget.findUnique({ where: { id } });
    if (!widget) {
      return NextResponse.json({ error: "Widget not found" }, { status: 404 });
    }

    // Fetch PUBLISHED posts for the widget's accounts
    const publishResults = await prisma.publishResult.findMany({
      where: {
        accountId: { in: widget.accountIds },
        status: "PUBLISHED",
        post: { archivedAt: null },
      },
      orderBy: { publishedAt: "desc" },
      take: widget.maxPosts,
      select: {
        id: true,
        platform: true,
        publishedAt: true,
        publishedUrl: true,
        post: {
          select: {
            id: true,
            content: true,
            mediaType: true,
            mediaUrls: true,
          },
        },
      },
    });

    const posts = publishResults.map((r) => ({
      id: r.post.id,
      content: r.post.content,
      mediaType: r.post.mediaType,
      mediaUrls: r.post.mediaUrls,
      platform: r.platform,
      publishedAt: r.publishedAt,
      publishedUrl: r.publishedUrl,
    }));

    const payload = {
      widgetId: widget.id,
      name: widget.name,
      theme: widget.theme,
      showPlatformIcons: widget.showPlatformIcons,
      showTimestamps: widget.showTimestamps,
      posts,
    };

    // Store in cache
    if (client) {
      try {
        await client.set(cacheKey(id), JSON.stringify(payload), "EX", CACHE_TTL_SECONDS);
      } catch {
        // Ignore Redis errors
      }
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
