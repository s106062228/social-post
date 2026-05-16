import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { predictPostPerformance } from "@/lib/ai";
import { prisma } from "@/lib/db";

const predictSchema = z.object({
  content: z.string().min(1).max(10000),
  platforms: z.array(z.string().min(1)).min(1).max(20),
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

    const parsed = predictSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { content, platforms } = parsed.data;

    // Build historical summary from recent PostInsights
    const recentInsights = await prisma.postInsights.findMany({
      where: {
        publishResult: {
          post: { userId: session.user.id },
          status: "PUBLISHED",
        },
      },
      include: {
        publishResult: { select: { platform: true } },
      },
      orderBy: { syncedAt: "desc" },
      take: 50,
    });

    let historicalSummary = "";
    if (recentInsights.length > 0) {
      const byPlatform: Record<string, { impressions: number[]; likes: number[]; comments: number[]; shares: number[] }> = {};
      for (const insight of recentInsights) {
        const plat = insight.publishResult.platform;
        if (!byPlatform[plat]) byPlatform[plat] = { impressions: [], likes: [], comments: [], shares: [] };
        if (insight.impressions != null) byPlatform[plat].impressions.push(insight.impressions);
        if (insight.likes != null) byPlatform[plat].likes.push(insight.likes);
        if (insight.comments != null) byPlatform[plat].comments.push(insight.comments);
        if (insight.shares != null) byPlatform[plat].shares.push(insight.shares);
      }
      const avg = (arr: number[]) =>
        arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
      const lines = Object.entries(byPlatform).map(([plat, data]) =>
        `${plat}: avg impressions=${avg(data.impressions)}, avg likes=${avg(data.likes)}, avg comments=${avg(data.comments)}, avg shares=${avg(data.shares)}`
      );
      historicalSummary = `Based on ${recentInsights.length} recent published posts:\n${lines.join("\n")}`;
    }

    const predictions = await predictPostPerformance(content, platforms, historicalSummary);
    return NextResponse.json({ predictions });
  } catch (err) {
    return handleRouteError(err);
  }
}
