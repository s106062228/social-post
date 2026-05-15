import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { generateContentCalendar } from "@/lib/ai";

const calendarSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
  postsPerWeek: z.number().int().min(1).max(21),
  platforms: z.array(z.string().min(1)).min(1).max(19),
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

    const parsed = calendarSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { startDate, endDate, postsPerWeek, platforms, tone } = parsed.data;

    if (startDate > endDate) {
      return NextResponse.json(
        { error: "startDate must be before or equal to endDate" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    // Gather brand kit context
    const brandKit = await prisma.brandKit.findUnique({ where: { userId } });
    let brandContext: string | undefined;
    if (brandKit) {
      const parts: string[] = [];
      if (brandKit.tagline) parts.push(`Tagline: ${brandKit.tagline}`);
      if (brandKit.voiceGuide) parts.push(`Voice: ${brandKit.voiceGuide}`);
      if (brandKit.doKeywords.length > 0) parts.push(`Key themes: ${brandKit.doKeywords.join(", ")}`);
      if (parts.length > 0) brandContext = parts.join(". ");
    }

    // Gather best posting times context
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentInsights = await prisma.postInsights.findMany({
      where: {
        publishResult: {
          post: { userId },
          publishedAt: { gte: since },
        },
      },
      select: {
        likes: true,
        comments: true,
        shares: true,
        publishResult: {
          select: { publishedAt: true, platform: true },
        },
      },
      take: 200,
    });

    let bestTimesContext: string | undefined;
    if (recentInsights.length > 0) {
      const hourEngagement: Record<number, { total: number; count: number }> = {};
      for (const row of recentInsights) {
        if (row.publishResult.publishedAt) {
          const h = new Date(row.publishResult.publishedAt).getUTCHours();
          const eng = (row.likes ?? 0) + (row.comments ?? 0) + (row.shares ?? 0);
          if (!hourEngagement[h]) hourEngagement[h] = { total: 0, count: 0 };
          hourEngagement[h].total += eng;
          hourEngagement[h].count += 1;
        }
      }
      const topHours = Object.entries(hourEngagement)
        .sort((a, b) => b[1].total / b[1].count - a[1].total / a[1].count)
        .slice(0, 3)
        .map(([h]) => `${h}:00 UTC`);
      if (topHours.length > 0) {
        bestTimesContext = `Historically best engagement hours: ${topHours.join(", ")}`;
      }
    }

    const days = await generateContentCalendar({
      startDate,
      endDate,
      postsPerWeek,
      platforms,
      tone,
      brandContext,
      bestTimesContext,
    });

    return NextResponse.json({ days });
  } catch (err) {
    return handleRouteError(err);
  }
}
