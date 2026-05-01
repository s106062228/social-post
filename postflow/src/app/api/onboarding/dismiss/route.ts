import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── POST /api/onboarding/dismiss ──────────────────────────────────────────────

export async function POST(_request: NextRequest): Promise<NextResponse> {
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

    await prisma.user.update({
      where: { id: session.user.id },
      data: { onboardingDismissed: true },
    });

    return NextResponse.json({ dismissed: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
