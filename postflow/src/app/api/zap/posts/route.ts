import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { validateApiKey, isApiKeyError } from "@/lib/api-key-auth";

const querySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(10).default(10),
});

// ── GET /api/zap/posts ────────────────────────────────────────────────────────
// Zapier polling trigger: returns newest posts, optionally filtered by createdAt > since.

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

    const posts = await prisma.post.findMany({
      where: {
        userId,
        archivedAt: null,
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      orderBy: { createdAt: "desc" },
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
        starred: true,
        isEvergreen: true,
        createdAt: true,
        updatedAt: true,
        tags: {
          select: { tag: { select: { id: true, name: true, color: true } } },
        },
        publishResults: {
          select: {
            platform: true,
            status: true,
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
      starred: p.starred,
      isEvergreen: p.isEvergreen,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      tags: p.tags.map((t) => t.tag),
      platforms: p.publishResults.map((r) => ({
        platform: r.platform,
        status: r.status,
        publishedUrl: r.publishedUrl,
        publishedAt: r.publishedAt?.toISOString() ?? null,
      })),
    }));

    return NextResponse.json({ posts: data });
  } catch (err) {
    return handleRouteError(err);
  }
}
