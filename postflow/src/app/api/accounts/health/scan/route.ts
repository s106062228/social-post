import { NextResponse } from "next/server";
import type { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeTokenHealthStatus } from "@/lib/queue/workers/token-health";

// ── POST /api/accounts/health/scan ────────────────────────────────────────────

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

    const accounts = await prisma.socialAccount.findMany({
      where: { userId: session.user.id, isActive: true },
      select: {
        id: true,
        accountName: true,
        platform: true,
        isActive: true,
        tokenExpiresAt: true,
      },
    });

    const now = new Date();
    const updates = await Promise.all(
      accounts.map(async (account: {
        id: string;
        accountName: string;
        platform: Platform;
        isActive: boolean;
        tokenExpiresAt: Date | null;
      }) => {
        const status = computeTokenHealthStatus(
          account.tokenExpiresAt,
          account.isActive
        );
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: { tokenHealthStatus: status, tokenHealthCheckedAt: now },
        });

        let daysUntilExpiry: number | null = null;
        if (account.tokenExpiresAt) {
          daysUntilExpiry = Math.floor(
            (account.tokenExpiresAt.getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24)
          );
        }

        return {
          accountId: account.id,
          accountName: account.accountName,
          platform: account.platform,
          isActive: account.isActive,
          healthStatus: status,
          tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
          daysUntilExpiry,
          lastCheckedAt: now.toISOString(),
        };
      })
    );

    return NextResponse.json({ health: updates });
  } catch (err) {
    return handleRouteError(err);
  }
}
