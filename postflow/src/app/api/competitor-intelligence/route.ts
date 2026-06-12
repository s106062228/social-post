import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { analyzeCompetitorContent } from "@/lib/ai";

const MAX_ANALYSES = 200;

const PLATFORM_VALUES = [
  "FACEBOOK", "INSTAGRAM", "THREADS", "LINKEDIN", "PINTEREST",
  "YOUTUBE", "TIKTOK", "TWITTER", "BLUESKY", "MASTODON", "TELEGRAM",
  "REDDIT", "NOSTR", "TUMBLR", "WORDPRESS", "MEDIUM", "GHOST",
  "DEVTO", "GOOGLE_BUSINESS", "HASHNODE", "BEEHIIV", "PIXELFED", "VIMEO",
] as const;

const createSchema = z.object({
  competitorName: z.string().min(1).max(100),
  content: z.string().min(10).max(10000),
  platform: z.enum(PLATFORM_VALUES).optional().nullable(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (rl) return NextResponse.json({ error: "Too Many Requests" }, { status: 429, headers: rateLimitHeaders(rl) });

    const analyses = await prisma.competitorContentAnalysis.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      analyses: analyses.map((a) => ({
        id: a.id,
        competitorName: a.competitorName,
        platform: a.platform,
        content: a.content.slice(0, 200),
        analysis: a.analysis,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (rl) return NextResponse.json({ error: "Too Many Requests" }, { status: 429, headers: rateLimitHeaders(rl) });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    const body = await request.json() as unknown;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const count = await prisma.competitorContentAnalysis.count({ where: { userId: session.user.id } });
    if (count >= MAX_ANALYSES) {
      return NextResponse.json({ error: "Maximum analyses limit reached" }, { status: 400 });
    }

    const brandKit = await prisma.brandKit.findUnique({ where: { userId: session.user.id } });
    let brandKitContext: string | null = null;
    if (brandKit) {
      const parts: string[] = [];
      if (brandKit.tagline) parts.push(`Tagline: ${brandKit.tagline}`);
      if (brandKit.voiceGuide) parts.push(`Voice: ${brandKit.voiceGuide}`);
      if (brandKit.doKeywords.length > 0) parts.push(`Do use: ${brandKit.doKeywords.join(", ")}`);
      if (brandKit.dontKeywords.length > 0) parts.push(`Avoid: ${brandKit.dontKeywords.join(", ")}`);
      if (parts.length > 0) brandKitContext = parts.join("\n");
    }

    const analysis = await analyzeCompetitorContent(
      parsed.data.content,
      parsed.data.platform ?? null,
      brandKitContext
    );

    if (!analysis) {
      return NextResponse.json({ error: "AI analysis failed" }, { status: 503 });
    }

    const record = await prisma.competitorContentAnalysis.create({
      data: {
        userId: session.user.id,
        competitorName: parsed.data.competitorName,
        platform: parsed.data.platform ?? null,
        content: parsed.data.content,
        analysis: analysis as object,
      },
    });

    return NextResponse.json({
      id: record.id,
      competitorName: record.competitorName,
      platform: record.platform,
      content: record.content.slice(0, 200),
      analysis: record.analysis,
      createdAt: record.createdAt,
    }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
