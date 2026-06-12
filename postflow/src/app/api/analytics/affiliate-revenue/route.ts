import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

type Period = "7d" | "30d" | "90d" | "all";

function getPeriodStart(period: Period): Date | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ── GET /api/analytics/affiliate-revenue ─────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period") ?? "30d";
    if (!["7d", "30d", "90d", "all"].includes(periodParam)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }
    const period = periodParam as Period;
    const periodStart = getPeriodStart(period);

    const where = {
      userId: session.user.id,
      ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
    };

    const links = await prisma.affiliateLink.findMany({
      where,
      orderBy: { revenue: "desc" },
    });

    const totalClicks = links.reduce((sum, l) => sum + l.clicks, 0);
    const totalConversions = links.reduce((sum, l) => sum + l.conversions, 0);
    const totalRevenue = links.reduce((sum, l) => sum + l.revenue, 0);
    const conversionRate = totalClicks > 0
      ? Math.round((totalConversions / totalClicks) * 10000) / 100
      : 0;

    const linkStats = links.map((l) => ({
      id: l.id,
      name: l.name,
      platform: l.platform,
      category: l.category,
      currency: l.currency,
      isActive: l.isActive,
      clicks: l.clicks,
      conversions: l.conversions,
      revenue: l.revenue,
      conversionRate: l.clicks > 0
        ? Math.round((l.conversions / l.clicks) * 10000) / 100
        : 0,
    }));

    return NextResponse.json(
      {
        period,
        totalClicks,
        totalConversions,
        totalRevenue,
        conversionRate,
        links: linkStats,
      },
      { headers: rateLimitHeaders(rl) }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
