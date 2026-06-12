import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(
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

    const contest = await prisma.contest.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    if (contest.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cannot draw winners for a cancelled contest" },
        { status: 409 }
      );
    }

    const eligibleEntries = await prisma.contestEntry.findMany({
      where: { contestId: id, isWinner: false },
    });

    if (eligibleEntries.length === 0) {
      return NextResponse.json(
        { error: "No eligible entries to draw from" },
        { status: 409 }
      );
    }

    const winnersCount = Math.min(contest.winnersCount, eligibleEntries.length);

    // Fisher-Yates shuffle and pick top N
    const shuffled = [...eligibleEntries];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const selectedWinners = shuffled.slice(0, winnersCount);
    const winnerIds = selectedWinners.map((e) => e.id);

    const now = new Date();
    await prisma.$transaction([
      prisma.contestEntry.updateMany({
        where: { id: { in: winnerIds } },
        data: { isWinner: true, pickedAt: now },
      }),
      prisma.contest.update({
        where: { id },
        data: { status: "ENDED" },
      }),
    ]);

    const winners = await prisma.contestEntry.findMany({
      where: { id: { in: winnerIds } },
      orderBy: { pickedAt: "desc" },
    });

    return NextResponse.json({ winners, total: winnerIds.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
