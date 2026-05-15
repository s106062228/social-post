import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

// ── GET /api/accounts ─────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accounts = await prisma.socialAccount.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        platform: true,
        accountName: true,
        platformAccountId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ accounts });
  } catch (err) {
    return handleRouteError(err);
  }
}
