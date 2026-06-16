import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { generateNewsletterDraft } from "@/lib/ai";
import { PublishStatus } from "@prisma/client";

const newsletterSchema = z.object({
  period: z.enum(["week", "month", "custom"]),
  from: z.string().optional(),
  to: z.string().optional(),
  tone: z.string().max(50).optional(),
  intro: z.string().max(500).optional(),
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
        { error: "AI features not configured" },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = newsletterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { period, from, to, tone, intro } = parsed.data;

    // Validate custom period
    if (period === "custom") {
      if (!from || !to) {
        return NextResponse.json(
          { error: "Custom period requires both from and to dates" },
          { status: 400 }
        );
      }
      // Validate ISO date format
      if (isNaN(Date.parse(from)) || isNaN(Date.parse(to))) {
        return NextResponse.json(
          { error: "Invalid date format for from or to" },
          { status: 400 }
        );
      }
    }

    // Compute date range
    const now = new Date();
    let fromDate: Date;
    let toDate: Date = now;
    let periodLabel: string;

    if (period === "week") {
      fromDate = new Date(now);
      fromDate.setDate(now.getDate() - 7);
      periodLabel = "This Week";
    } else if (period === "month") {
      fromDate = new Date(now);
      fromDate.setDate(now.getDate() - 30);
      periodLabel = "This Month";
    } else {
      fromDate = new Date(from!);
      toDate = new Date(to!);
      periodLabel = `${from} to ${to}`;
    }

    // Fetch published posts in the period
    const publishResults = await prisma.publishResult.findMany({
      where: {
        status: PublishStatus.PUBLISHED,
        publishedAt: {
          gte: fromDate,
          lte: toDate,
        },
        post: {
          userId: session.user.id,
        },
      },
      include: {
        post: {
          select: { content: true },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: 20,
    });

    const posts = publishResults.map((pr) => ({
      content: pr.post.content,
      platform: pr.platform,
      publishedAt: pr.publishedAt
        ? pr.publishedAt.toISOString().split("T")[0]
        : undefined,
    }));

    if (posts.length === 0) {
      return NextResponse.json(
        { error: "No published posts found in the selected period" },
        { status: 422 }
      );
    }

    const newsletter = await generateNewsletterDraft(
      posts,
      periodLabel,
      tone,
      intro
    );

    if (!newsletter) {
      return NextResponse.json(
        { error: "Failed to generate newsletter draft" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { newsletter, postCount: posts.length },
      { headers: rateLimitHeaders(rl) }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
