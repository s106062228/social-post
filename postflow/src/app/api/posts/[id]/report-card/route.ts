import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { type Platform, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeScore, type InsightsInput } from "@/lib/content-score";
import { analyzeSeo } from "@/lib/seo-analysis";
import { analyzeReadability } from "@/lib/readability";
import { checkBrandCompliance } from "@/lib/brand-compliance";

const postIdSchema = z.string().cuid();

// ── Grade helpers ─────────────────────────────────────────────────────────────

function letterGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/** Normalize a raw engagement score (which can be very large) to 0–100. */
function normalizeEngagementScore(rawScore: number): number {
  // log10 scale: 0 → 0, ~31 → ~50, ~1000 → ~100
  return Math.min(
    Math.log10(Math.max(rawScore, 1) + 1) / Math.log10(1001) * 100,
    100
  );
}

/** Map sentiment string to a 0–100 score. */
function sentimentScore(sentiment: string | null): number {
  if (sentiment === "POSITIVE") return 100;
  if (sentiment === "NEGATIVE") return 30;
  return 65; // NEUTRAL or null
}

/** Map Flesch-Kincaid score (0–100, higher = easier) to 0–100. */
function normalizeReadability(fk: number): number {
  return Math.min(100, Math.max(0, fk));
}

// ── Generate recommendations from low-scoring dimensions ─────────────────────

interface DimensionScore {
  name: string;
  score: number;
  grade: string;
  details: string;
}

function buildRecommendations(dimensions: DimensionScore[]): string[] {
  const sorted = [...dimensions].sort((a, b) => a.score - b.score);
  const recommendations: string[] = [];

  for (const dim of sorted.slice(0, 3)) {
    if (dim.score >= 70) break; // only recommend for weak areas
    if (dim.name === "Engagement") {
      recommendations.push(
        "Boost engagement by asking a question, including a CTA, or adding relevant hashtags to drive more interactions."
      );
    } else if (dim.name === "SEO") {
      recommendations.push(
        "Improve discoverability: add relevant hashtags, include a URL, and use an engagement trigger like a question or CTA."
      );
    } else if (dim.name === "Readability") {
      recommendations.push(
        "Simplify your writing: use shorter sentences and everyday vocabulary to improve readability."
      );
    } else if (dim.name === "Brand Compliance") {
      recommendations.push(
        "Review your brand guidelines: avoid forbidden terms and ensure preferred keywords appear in your content."
      );
    } else if (dim.name === "Sentiment") {
      recommendations.push(
        "Consider a more positive or neutral tone to resonate better with your audience."
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Great work! Keep publishing consistently to maintain your performance."
    );
  }

  return recommendations;
}

// ── GET /api/posts/[id]/report-card ──────────────────────────────────────────

export async function GET(
  _request: NextRequest,
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
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Fetch post + brand kit in parallel
    const [post, brandKit] = await Promise.all([
      prisma.post.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          content: true,
          sentiment: true,
          publishResults: {
            where: { status: PublishStatus.PUBLISHED },
            select: {
              id: true,
              platform: true,
              publishedUrl: true,
              insights: {
                select: {
                  impressions: true,
                  reach: true,
                  likes: true,
                  comments: true,
                  shares: true,
                },
              },
            },
          },
        },
      }),
      prisma.brandKit.findUnique({
        where: { userId: session.user.id },
        select: { doKeywords: true, dontKeywords: true },
      }),
    ]);

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // ── Compute content-based scores ─────────────────────────────────────────

    const seoResult = analyzeSeo(post.content);
    const readabilityResult = analyzeReadability(post.content);

    const seoScore = seoResult.score;
    const readabilityScore100 = normalizeReadability(readabilityResult.fleschKincaid);
    const sentimentScore100 = sentimentScore(post.sentiment);
    const complianceScore100 = brandKit
      ? checkBrandCompliance(post.content, brandKit).score
      : 100;

    // ── Compute engagement score ──────────────────────────────────────────────

    // Aggregate insights across all published results
    const aggregatedInsights: InsightsInput = {
      impressions: 0,
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    };

    for (const r of post.publishResults) {
      if (r.insights) {
        aggregatedInsights.impressions =
          (aggregatedInsights.impressions ?? 0) + (r.insights.impressions ?? 0);
        aggregatedInsights.reach =
          (aggregatedInsights.reach ?? 0) + (r.insights.reach ?? 0);
        aggregatedInsights.likes =
          (aggregatedInsights.likes ?? 0) + (r.insights.likes ?? 0);
        aggregatedInsights.comments =
          (aggregatedInsights.comments ?? 0) + (r.insights.comments ?? 0);
        aggregatedInsights.shares =
          (aggregatedInsights.shares ?? 0) + (r.insights.shares ?? 0);
      }
    }

    const rawEngagementScore = computeScore(aggregatedInsights);
    const engagementScore100 = normalizeEngagementScore(rawEngagementScore);

    // ── Compute weighted overall score ────────────────────────────────────────
    // Engagement 40%, SEO 20%, Readability 20%, Compliance 10%, Sentiment 10%

    const overallScore = Math.round(
      engagementScore100 * 0.4 +
      seoScore * 0.2 +
      readabilityScore100 * 0.2 +
      complianceScore100 * 0.1 +
      sentimentScore100 * 0.1
    );

    const overallGrade = letterGrade(overallScore);

    // ── Build dimensions array ────────────────────────────────────────────────

    const dimensions: DimensionScore[] = [
      {
        name: "Engagement",
        score: Math.round(engagementScore100),
        grade: letterGrade(engagementScore100),
        details:
          rawEngagementScore > 0
            ? `Raw engagement score: ${Math.round(rawEngagementScore).toLocaleString()} pts`
            : "No engagement data yet",
      },
      {
        name: "Content Quality",
        score: Math.round(seoScore),
        grade: letterGrade(seoScore),
        details: `SEO rating: ${seoResult.label}`,
      },
      {
        name: "SEO",
        score: Math.round(seoScore),
        grade: letterGrade(seoScore),
        details: `${seoResult.checks.filter((c) => c.passed).length}/${seoResult.checks.length} SEO checks passed`,
      },
      {
        name: "Readability",
        score: Math.round(readabilityScore100),
        grade: letterGrade(readabilityScore100),
        details: `Flesch-Kincaid: ${readabilityResult.fleschKincaid} (${readabilityResult.label})`,
      },
      {
        name: "Brand Compliance",
        score: complianceScore100,
        grade: letterGrade(complianceScore100),
        details: brandKit ? `Compliance score: ${complianceScore100}%` : "No brand kit configured",
      },
    ];

    // ── Total engagement metrics ──────────────────────────────────────────────

    const totalEngagement =
      (aggregatedInsights.likes ?? 0) +
      (aggregatedInsights.comments ?? 0) +
      (aggregatedInsights.shares ?? 0);

    // ── Top platform (highest engagement score) ───────────────────────────────

    let topPlatform: Platform | null = null;
    let topScore = -1;

    for (const r of post.publishResults) {
      if (r.insights) {
        const s = computeScore(r.insights);
        if (s > topScore) {
          topScore = s;
          topPlatform = r.platform;
        }
      }
    }

    const publishedPlatforms = post.publishResults.map((r) => r.platform);

    // ── Recommendations ───────────────────────────────────────────────────────

    const recommendations = buildRecommendations(dimensions);

    return NextResponse.json({
      postId: post.id,
      content: post.content,
      overallGrade,
      overallScore,
      dimensions,
      totalEngagement,
      topPlatform,
      publishedPlatforms,
      recommendations,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
