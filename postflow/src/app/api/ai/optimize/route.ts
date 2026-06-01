import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { optimizePost } from "@/lib/ai";

const PLATFORMS = [
  "FACEBOOK", "INSTAGRAM", "THREADS", "LINKEDIN", "PINTEREST", "YOUTUBE",
  "TIKTOK", "TWITTER", "BLUESKY", "MASTODON", "TELEGRAM", "REDDIT",
  "NOSTR", "TUMBLR", "WORDPRESS", "MEDIUM", "GHOST", "DEVTO",
  "GOOGLE_BUSINESS", "HASHNODE", "BEEHIIV", "PIXELFED", "VIMEO",
] as const;

const optimizeSchema = z.object({
  content: z.string().min(1).max(10000),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  tone: z.string().max(100).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI features are not configured" },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = optimizeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { content, platforms, tone } = parsed.data;

    // Optionally fetch brand kit for voice context
    let brandKitContext: string | null = null;
    const brandKit = await prisma.brandKit.findUnique({
      where: { userId: session.user.id },
      select: { voiceGuide: true, tagline: true, doKeywords: true, dontKeywords: true },
    });
    if (brandKit) {
      const parts: string[] = [];
      if (brandKit.tagline) parts.push(`Tagline: ${brandKit.tagline}`);
      if (brandKit.voiceGuide) parts.push(`Voice guide: ${brandKit.voiceGuide}`);
      if (brandKit.doKeywords.length > 0) parts.push(`Use these keywords: ${brandKit.doKeywords.join(", ")}`);
      if (brandKit.dontKeywords.length > 0) parts.push(`Avoid these words: ${brandKit.dontKeywords.join(", ")}`);
      if (parts.length > 0) brandKitContext = parts.join("\n");
    }

    const result = await optimizePost(content, platforms, brandKitContext, tone ?? null);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
