import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { analyzeReadability } from "@/lib/readability";
import { analyzeSeo } from "@/lib/seo-analysis";
import { checkBrandCompliance } from "@/lib/brand-compliance";
import {
  computeQualityScore,
  sentimentToScore,
} from "@/lib/quality-score";

const postIdSchema = z.string().cuid();

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

    const [post, brandKit] = await Promise.all([
      prisma.post.findUnique({
        where: { id },
        select: { id: true, userId: true, content: true, sentiment: true },
      }),
      prisma.brandKit.findUnique({
        where: { userId: session.user.id },
        select: { doKeywords: true, dontKeywords: true },
      }),
    ]);

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const readabilityResult = analyzeReadability(post.content);
    const seoResult = analyzeSeo(post.content);
    const sentimentScore = sentimentToScore(post.sentiment);
    const complianceScore = brandKit
      ? checkBrandCompliance(post.content, brandKit).score
      : null;

    const qualityScore = computeQualityScore({
      readabilityScore: readabilityResult.fleschKincaid,
      seoScore: seoResult.score,
      sentimentScore,
      complianceScore,
    });

    return NextResponse.json({
      qualityScore: qualityScore.score,
      label: qualityScore.label,
      breakdown: qualityScore.breakdown,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
