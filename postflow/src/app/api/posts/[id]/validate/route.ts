import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { validateForAllPlatforms } from "@/lib/content-validator";

const postIdSchema = z.string().cuid();

const bodySchema = z.object({
  platforms: z
    .array(z.string())
    .optional(),
});

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
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true, content: true, mediaType: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    let body: { platforms?: string[] } = {};
    try {
      const raw = await request.json();
      const parsed = bodySchema.safeParse(raw);
      if (parsed.success) {
        body = parsed.data;
      }
    } catch {
      // empty body is fine — validate against all platforms
    }

    // Use provided platforms or fall back to all platforms
    const allPlatforms: Platform[] = [
      "FACEBOOK", "INSTAGRAM", "THREADS", "LINKEDIN", "PINTEREST",
      "YOUTUBE", "TIKTOK", "TWITTER", "BLUESKY", "MASTODON",
      "TELEGRAM", "REDDIT", "NOSTR", "TUMBLR", "WORDPRESS",
      "MEDIUM", "GHOST", "DEVTO", "GOOGLE_BUSINESS", "HASHNODE", "BEEHIIV", "PIXELFED", "VIMEO",
    ];

    const platforms: Platform[] = body.platforms && body.platforms.length > 0
      ? body.platforms.filter((p): p is Platform => allPlatforms.includes(p as Platform))
      : allPlatforms;

    if (platforms.length === 0) {
      return NextResponse.json({ error: "No valid platforms specified" }, { status: 400 });
    }

    const results = validateForAllPlatforms(post.content, post.mediaType, platforms);

    return NextResponse.json({ results });
  } catch (err) {
    return handleRouteError(err);
  }
}
