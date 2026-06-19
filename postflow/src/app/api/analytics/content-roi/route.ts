import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus, ConversionType } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
});

export interface ConversionsByType {
  type: ConversionType;
  count: number;
  totalRevenue: number;
}

export interface TopPostEntry {
  postId: string;
  content: string;
  count: number;
  totalRevenue: number;
}

export interface ContentROIResponse {
  period: string;
  totalConversions: number;
  totalRevenue: number;
  avgRevenue: number;
  currency: string;
  conversionsByType: ConversionsByType[];
  topPostsByCount: TopPostEntry[];
  topPostsByRevenue: TopPostEntry[];
}

// ── GET /api/analytics/content-roi ───────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const parsed = querySchema.safeParse({
      period: request.nextUrl.searchParams.get("period") ?? "30d",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period } = parsed.data;
    const userId = session.user.id;

    let cutoff: Date | null = null;
    if (period !== "all") {
      const daysBack = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);
    }

    const conversions = await prisma.contentConversion.findMany({
      where: {
        userId,
        ...(cutoff ? { occurredAt: { gte: cutoff } } : {}),
      },
      include: {
        post: {
          select: { id: true, content: true, status: true },
        },
      },
      orderBy: { occurredAt: "desc" },
    });

    const totalConversions = conversions.length;
    const totalRevenue = conversions.reduce((sum, c) => sum + (c.value ?? 0), 0);
    const revenueConversions = conversions.filter((c) => (c.value ?? 0) > 0);
    const avgRevenue =
      revenueConversions.length > 0
        ? totalRevenue / revenueConversions.length
        : 0;

    // Conversions by type
    const typeMap = new Map<
      ConversionType,
      { count: number; totalRevenue: number }
    >();
    for (const c of conversions) {
      const existing = typeMap.get(c.type) ?? { count: 0, totalRevenue: 0 };
      existing.count += 1;
      existing.totalRevenue += c.value ?? 0;
      typeMap.set(c.type, existing);
    }
    const conversionsByType: ConversionsByType[] = Array.from(
      typeMap.entries()
    ).map(([type, data]) => ({ type, ...data }));
    conversionsByType.sort((a, b) => b.count - a.count);

    // Top posts by count and by revenue
    const postMap = new Map<
      string,
      { content: string; count: number; totalRevenue: number }
    >();
    for (const c of conversions) {
      if (!c.post) continue;
      const existing = postMap.get(c.postId) ?? {
        content: c.post.content,
        count: 0,
        totalRevenue: 0,
      };
      existing.count += 1;
      existing.totalRevenue += c.value ?? 0;
      postMap.set(c.postId, existing);
    }

    const allPostEntries: TopPostEntry[] = Array.from(postMap.entries()).map(
      ([postId, data]) => ({
        postId,
        content: data.content.slice(0, 80),
        count: data.count,
        totalRevenue: data.totalRevenue,
      })
    );

    const topPostsByCount = [...allPostEntries]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topPostsByRevenue = [...allPostEntries]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5);

    return NextResponse.json({
      period,
      totalConversions,
      totalRevenue,
      avgRevenue,
      currency: "USD",
      conversionsByType,
      topPostsByCount,
      topPostsByRevenue,
    } satisfies ContentROIResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
