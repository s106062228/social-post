import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── GET /api/analytics/audit/[id] ────────────────────────────────────────────

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

    const report = await prisma.auditReport.findUnique({
      where: { id },
    });

    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (report.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    function gradeFromScore(score: number): string {
      if (score >= 90) return "A+";
      if (score >= 80) return "A";
      if (score >= 70) return "B";
      if (score >= 60) return "C";
      if (score >= 50) return "D";
      return "F";
    }

    return NextResponse.json({
      id: report.id,
      period: report.period,
      generatedAt: report.generatedAt.toISOString(),
      overallScore: report.overallScore,
      overallGrade: gradeFromScore(report.overallScore),
      accountHealth: report.accountHealth,
      contentMix: report.contentMix,
      postingPatterns: report.postingPatterns,
      engagementBenchmarks: report.engagementBenchmarks,
      consistencyScore: report.consistencyScore,
      topContent: report.topContent,
      recommendations: report.recommendations,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
