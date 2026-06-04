import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { validateForAllPlatforms, type PlatformValidationResult } from "@/lib/content-validator";
import { checkContentRules, type ContentRule } from "@/lib/content-rules";
import { checkBrandCompliance, type ComplianceResult } from "@/lib/brand-compliance";
import type { Platform, MediaType } from "@prisma/client";

const bulkValidateSchema = z.object({
  postIds: z.array(z.string().cuid()).min(1).max(50),
});

type PostResult = {
  postId: string;
  content: string;
  status: string;
  platformResults: PlatformValidationResult[];
  contentRulesResult: {
    violations: Array<{ type: string; severity: string; message: string }>;
    errors: number;
    warnings: number;
    compliant: boolean;
  };
  brandResult: ComplianceResult | null;
  overallValid: boolean;
  errorCount: number;
  warningCount: number;
};

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bulkValidateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { postIds } = parsed.data;
    const userId = session.user.id;

    // Fetch posts owned by the user
    const posts = await prisma.post.findMany({
      where: { id: { in: postIds }, userId },
      select: {
        id: true,
        content: true,
        status: true,
        mediaType: true,
        mediaUrls: true,
        publishResults: {
          select: { platform: true },
          distinct: ["platform"],
        },
      },
    });

    // Load user's active content rules
    const contentRules = await prisma.contentRule.findMany({
      where: { userId, isActive: true },
    });

    // Load user's brand kit (if any)
    const brandKit = await prisma.brandKit.findUnique({
      where: { userId },
      select: { doKeywords: true, dontKeywords: true },
    });

    const results: PostResult[] = posts.map((post) => {
      // Determine target platforms from publishResults
      const platforms: Platform[] = post.publishResults.map((r) => r.platform as Platform);

      // Platform validation
      const platformResults = validateForAllPlatforms(
        post.content,
        post.mediaType as MediaType,
        platforms,
        post.mediaUrls
      );

      // Content rules check
      const rulesCheck = checkContentRules(post.content, contentRules as ContentRule[]);
      const contentRulesResult = {
        violations: rulesCheck.violations.map((v) => ({
          type: v.type,
          severity: v.severity,
          message: v.message,
        })),
        errors: rulesCheck.errors.length,
        warnings: rulesCheck.warnings.length,
        compliant: rulesCheck.compliant,
      };

      // Brand compliance check
      const brandResult = brandKit
        ? checkBrandCompliance(post.content, brandKit)
        : null;

      // Aggregate counts
      const platformErrors = platformResults.reduce((sum, r) => sum + r.errors.length, 0);
      const platformWarnings = platformResults.reduce((sum, r) => sum + r.warnings.length, 0);
      const ruleErrors = rulesCheck.errors.length;
      const ruleWarnings = rulesCheck.warnings.length;
      const brandErrors = brandResult && !brandResult.compliant ? brandResult.violations.length : 0;

      const errorCount = platformErrors + ruleErrors + brandErrors;
      const warningCount = platformWarnings + ruleWarnings;

      const overallValid = errorCount === 0;

      return {
        postId: post.id,
        content: post.content.slice(0, 100),
        status: post.status,
        platformResults,
        contentRulesResult,
        brandResult,
        overallValid,
        errorCount,
        warningCount,
      };
    });

    const passingPosts = results.filter((r) => r.overallValid).length;
    const failingPosts = results.filter((r) => !r.overallValid).length;

    return NextResponse.json({
      results,
      totalPosts: results.length,
      passingPosts,
      failingPosts,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
