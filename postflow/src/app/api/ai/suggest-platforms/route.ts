import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { suggestOptimalPlatforms } from "@/lib/ai";

const suggestPlatformsSchema = z.object({
  content: z.string().min(10).max(10000),
  mediaType: z.enum(["NONE", "IMAGE", "VIDEO", "CAROUSEL"]),
  platforms: z.array(z.string().min(1)).min(1),
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

    const parsed = suggestPlatformsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { content, mediaType, platforms } = parsed.data;

    // Build historical context from recent PostInsights per platform
    let historicalContext: string | null = null;
    try {
      const insights = await prisma.postInsights.findMany({
        where: {
          publishResult: {
            post: { userId: session.user.id },
            status: "PUBLISHED",
          },
        },
        select: {
          impressions: true,
          reach: true,
          likes: true,
          comments: true,
          shares: true,
          publishResult: {
            select: { platform: true },
          },
        },
        orderBy: { syncedAt: "desc" },
        take: 100,
      });

      if (insights.length > 0) {
        const platformSums: Record<
          string,
          { total: number; count: number }
        > = {};
        for (const ins of insights) {
          const platform = ins.publishResult.platform as string;
          const eng =
            (ins.likes ?? 0) +
            (ins.comments ?? 0) +
            (ins.shares ?? 0);
          if (!platformSums[platform]) {
            platformSums[platform] = { total: 0, count: 0 };
          }
          platformSums[platform].total += eng;
          platformSums[platform].count += 1;
        }
        const lines = Object.entries(platformSums).map(
          ([p, { total, count }]) =>
            `${p}: avg engagement ${(total / count).toFixed(1)} (${count} posts)`
        );
        historicalContext = lines.join("\n");
      }
    } catch {
      // historical context is optional; ignore errors
    }

    const result = await suggestOptimalPlatforms(
      content,
      mediaType,
      platforms,
      historicalContext
    );

    if (!result) {
      return NextResponse.json(
        { error: "Failed to generate platform suggestions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestions: result.suggestions, overallStrategy: result.overallStrategy });
  } catch (err) {
    return handleRouteError(err);
  }
}
