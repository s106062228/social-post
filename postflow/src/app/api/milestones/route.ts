import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── GET /api/milestones ───────────────────────────────────────────────────────

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

    const milestones = await prisma.followerMilestone.findMany({
      where: { userId: session.user.id },
      orderBy: { achievedAt: "desc" },
      select: {
        id: true,
        platform: true,
        milestone: true,
        achievedAt: true,
        celebrated: true,
        accountId: true,
        account: {
          select: { accountName: true },
        },
      },
    });

    return NextResponse.json({
      milestones: milestones.map((m) => ({
        id: m.id,
        platform: m.platform,
        milestone: m.milestone,
        achievedAt: m.achievedAt.toISOString(),
        celebrated: m.celebrated,
        accountId: m.accountId,
        accountName: m.account.accountName,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
