import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { suggestContentGaps } from "@/lib/ai";
import { computeWordFrequency } from "@/lib/word-frequency";

export async function POST(_request: NextRequest): Promise<NextResponse> {
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

    const userId = session.user.id;
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Gather content from recent published posts
    const recentPosts = await prisma.post.findMany({
      where: { userId, status: "PUBLISHED", updatedAt: { gte: since } },
      select: {
        content: true,
        publishResults: { select: { platform: true } },
      },
    });

    // Extract top topics from post content using word frequency
    const contents = recentPosts.map((p: { content: string; publishResults: { platform: string }[] }) => p.content);
    const wordFreqs = computeWordFrequency(contents, 30);
    const coveredTopics = wordFreqs.map((w) => w.text);

    // Determine platforms used
    const platformSet = new Set<string>();
    for (const post of recentPosts as { content: string; publishResults: { platform: string }[] }[]) {
      for (const pr of post.publishResults) {
        platformSet.add(pr.platform);
      }
    }
    const platforms = Array.from(platformSet);

    // Optionally include brand kit context
    const brandKit = await prisma.brandKit.findUnique({ where: { userId } });
    let brandKitContext: string | undefined;
    if (brandKit) {
      const parts: string[] = [];
      if (brandKit.tagline) parts.push(`Tagline: ${brandKit.tagline}`);
      if (brandKit.voiceGuide) parts.push(`Voice: ${brandKit.voiceGuide}`);
      if (brandKit.doKeywords.length > 0)
        parts.push(`Key themes: ${brandKit.doKeywords.join(", ")}`);
      if (parts.length > 0) brandKitContext = parts.join(". ");
    }

    const suggestions = await suggestContentGaps(coveredTopics, platforms, brandKitContext);

    return NextResponse.json({ suggestions, coveredTopicsCount: coveredTopics.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
