import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const WIDGET_KEYS = [
  "kpis",
  "line_chart",
  "platform_dist",
  "hourly_activity",
  "platform_performance",
  "best_times",
  "word_cloud",
  "hashtag_performance",
  "consistency",
  "scheduling_advisor",
  "year_heatmap",
  "content_mix",
  "benchmarks",
  "content_gaps",
  "tone_consistency",
  "writing_stats",
  "monthly_summary",
  "performance_coaching",
  "publish_reliability",
  "content_fatigue",
  "performance_matrix",
  "sentiment_trend",
] as const;

export type WidgetKey = (typeof WIDGET_KEYS)[number];

export interface WidgetConfig {
  widgetKey: WidgetKey;
  visible: boolean;
  position: number;
  label: string;
}

const WIDGET_LABELS: Record<WidgetKey, string> = {
  kpis: "KPI Summary Cards",
  line_chart: "Posts Over Time",
  platform_dist: "Platform Distribution",
  hourly_activity: "Hourly Activity",
  platform_performance: "Platform Performance Table",
  best_times: "Best Times to Post",
  word_cloud: "Word Cloud",
  hashtag_performance: "Hashtag Performance",
  consistency: "Posting Consistency Score",
  scheduling_advisor: "AI Scheduling Advisor",
  year_heatmap: "Year Activity Heatmap",
  content_mix: "Content Mix Analysis",
  benchmarks: "Engagement Benchmarks",
  content_gaps: "Content Gap Analysis",
  tone_consistency: "Tone Consistency",
  writing_stats: "Writing Style Analytics",
  monthly_summary: "Monthly Summary",
  performance_coaching: "AI Performance Coaching",
  publish_reliability: "Platform Publishing Reliability",
  content_fatigue: "Content Fatigue Detection",
  performance_matrix: "Content Category × Platform Matrix",
  sentiment_trend: "Sentiment Trend",
};

function buildDefaultConfig(): WidgetConfig[] {
  return WIDGET_KEYS.map((key, idx) => ({
    widgetKey: key,
    visible: true,
    position: idx,
    label: WIDGET_LABELS[key],
  }));
}

const patchSchema = z.object({
  widgets: z.array(
    z.object({
      widgetKey: z.enum(WIDGET_KEYS),
      visible: z.boolean(),
      position: z.number().int().min(0),
    })
  ),
});

export async function GET(): Promise<NextResponse> {
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

    const rows = await prisma.dashboardWidget.findMany({
      where: { userId: session.user.id },
      orderBy: { position: "asc" },
    });

    if (rows.length === 0) {
      return NextResponse.json({ widgets: buildDefaultConfig() });
    }

    const storedMap = new Map(rows.map((r) => [r.widgetKey, r]));
    const widgets: WidgetConfig[] = WIDGET_KEYS.map((key, idx) => {
      const stored = storedMap.get(key);
      return {
        widgetKey: key,
        visible: stored?.visible ?? true,
        position: stored?.position ?? idx,
        label: WIDGET_LABELS[key],
      };
    });

    widgets.sort((a, b) => a.position - b.position);
    return NextResponse.json({ widgets });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
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

    const body: unknown = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const now = new Date();
    await prisma.$transaction(
      parsed.data.widgets.map(({ widgetKey, visible, position }) =>
        prisma.dashboardWidget.upsert({
          where: { userId_widgetKey: { userId: session.user.id, widgetKey } },
          create: { userId: session.user.id, widgetKey, visible, position, updatedAt: now },
          update: { visible, position, updatedAt: now },
        })
      )
    );

    const rows = await prisma.dashboardWidget.findMany({
      where: { userId: session.user.id },
      orderBy: { position: "asc" },
    });

    const storedMap = new Map(rows.map((r) => [r.widgetKey, r]));
    const widgets: WidgetConfig[] = WIDGET_KEYS.map((key, idx) => {
      const stored = storedMap.get(key);
      return {
        widgetKey: key,
        visible: stored?.visible ?? true,
        position: stored?.position ?? idx,
        label: WIDGET_LABELS[key],
      };
    });
    widgets.sort((a, b) => a.position - b.position);

    return NextResponse.json({ widgets });
  } catch (err) {
    return handleRouteError(err);
  }
}
