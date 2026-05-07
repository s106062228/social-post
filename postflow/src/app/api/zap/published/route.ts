import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { validateApiKey, isApiKeyError } from "@/lib/api-key-auth";

const querySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(10).default(10),
});

// ── GET /api/zap/published ────────────────────────────────────────────────────
// Zapier polling trigger: returns recently PUBLISHED posts.
// Defaults to the last 24 h when `since` is omitted.

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await validateApiKey(request);
    if (isApiKeyError(auth)) return auth;
    const { userId } = auth;

    const parsed = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
    }
    const { since, limit } = parsed.data;

    const sinceDate = since
      ? new Date(since)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find PUBLISHED posts that have at least one PublishResult published after sinceDate
    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: "PUBLISHED",
        archivedAt: null,
        publishResults: {
          some: {
            status: "PUBLISHED",
            publishedAt: { gt: sinceDate },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        content: true,
        mediaType: true,
        mediaUrls: true,
        status: true,
        scheduledAt: true,
        language: true,
        sentiment: true,
        sentimentScore: true,
        createdAt: true,
        updatedAt: true,
        tags: {
          select: { tag: { select: { id: true, name: true, color: true } } },
        },
        publishResults: {
          where: { status: "PUBLISHED" },
          select: {
            platform: true,
            status: true,
            platformPostId: true,
            publishedUrl: true,
            publishedAt: true,
          },
        },
      },
    });

    const data = posts.map((p) => ({
      id: p.id,
      content: p.content,
      mediaType: p.mediaType,
      mediaUrls: p.mediaUrls,
      status: p.status,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      language: p.language,
      sentiment: p.sentiment,
      sentimentScore: p.sentimentScore,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      tags: p.tags.map((t) => t.tag),
      platforms: p.publishResults.map((r) => ({
        platform: r.platform,
        platformPostId: r.platformPostId,
        publishedUrl: r.publishedUrl,
        publishedAt: r.publishedAt?.toISOString() ?? null,
      })),
    }));

    return NextResponse.json({ posts: data });
  } catch (err) {
    return handleRouteError(err);
  }
}
