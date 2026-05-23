import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { ACHIEVEMENT_TYPES, type AchievementType } from "@/lib/achievements";

// ── GET /api/achievements ─────────────────────────────────────────────────────

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

    const earnedRows = await prisma.achievement.findMany({
      where: { userId: session.user.id },
      select: { type: true, awardedAt: true },
    });

    const earnedMap = new Map(earnedRows.map((r: { type: string; awardedAt: Date }) => [r.type, r.awardedAt]));

    const achievements = (Object.keys(ACHIEVEMENT_TYPES) as AchievementType[])
      .sort()
      .map((type) => {
        const meta = ACHIEVEMENT_TYPES[type];
        const awardedAt = earnedMap.get(type);
        return {
          type,
          label: meta.label,
          description: meta.description,
          icon: meta.icon,
          earned: earnedMap.has(type),
          awardedAt: awardedAt ?? null,
        };
      });

    return NextResponse.json({ achievements });
  } catch (err) {
    return handleRouteError(err);
  }
}
