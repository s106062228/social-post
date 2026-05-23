import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { checkAndAwardAchievements } from "@/lib/achievements";

// ── POST /api/achievements/check ──────────────────────────────────────────────

export async function POST(): Promise<NextResponse> {
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

    const awarded = await checkAndAwardAchievements(session.user.id, prisma);

    return NextResponse.json({ awarded });
  } catch (err) {
    return handleRouteError(err);
  }
}
