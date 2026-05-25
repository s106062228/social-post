import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── GET /api/bio-pages/[id]/analytics ─────────────────────────────────────────
// Returns click analytics for a bio page (auth + ownership required)

export async function GET(
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
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;

    const page = await prisma.linkBioPage.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            clickEvents: {
              select: { clickedAt: true, deviceType: true },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!page) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (page.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Build daily click series for last 30 days
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      dailyMap.set(d.toISOString().slice(0, 10), 0);
    }

    // Device breakdown
    const deviceMap: Record<string, number> = {};

    let totalClicks = 0;

    const itemStats = page.items.map((item) => {
      let clicksLast7d = 0;
      let itemTotal = 0;

      for (const click of item.clickEvents) {
        itemTotal++;
        totalClicks++;

        const dateKey = click.clickedAt.toISOString().slice(0, 10);
        if (click.clickedAt >= thirtyDaysAgo && dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + 1);
        }
        if (click.clickedAt >= sevenDaysAgo) {
          clicksLast7d++;
        }
        const device = click.deviceType ?? "unknown";
        deviceMap[device] = (deviceMap[device] ?? 0) + 1;
      }

      return {
        itemId: item.id,
        label: item.label,
        url: item.url,
        clicks: item.clicks,
        clicksLast7d,
        clicksTotal: itemTotal,
      };
    });

    const dailyClicks = Array.from(dailyMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    const deviceBreakdown = Object.entries(deviceMap).map(([device, count]) => ({
      device,
      count,
    }));

    return NextResponse.json({
      pageId: page.id,
      slug: page.slug,
      title: page.title,
      totalClicks,
      items: itemStats,
      dailyClicks,
      deviceBreakdown,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
