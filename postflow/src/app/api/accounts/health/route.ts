import { NextResponse } from "next/server";
import type { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeTokenHealthStatus } from "@/lib/queue/workers/token-health";

// ── GET /api/accounts/health ──────────────────────────────────────────────────

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

    const accounts = await prisma.socialAccount.findMany({
      where: { userId: session.user.id, isActive: true },
      select: {
        id: true,
        accountName: true,
        platform: true,
        isActive: true,
        tokenExpiresAt: true,
        tokenHealthStatus: true,
        tokenHealthCheckedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const now = new Date();

    const health = accounts.map((account: {
      id: string;
      accountName: string;
      platform: Platform;
      isActive: boolean;
      tokenExpiresAt: Date | null;
      tokenHealthStatus: string | null;
      tokenHealthCheckedAt: Date | null;
    }) => {
      const status =
        (account.tokenHealthStatus as
          | "ok"
          | "expiring"
          | "expired"
          | "invalid"
          | null) ??
        computeTokenHealthStatus(account.tokenExpiresAt, account.isActive);

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
        lastCheckedAt: account.tokenHealthCheckedAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ health });
  } catch (err) {
    return handleRouteError(err);
  }
}
