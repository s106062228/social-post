import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/teams/[id]/members ───────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
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

    const requesterMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: id, userId: session.user.id } },
    });

    if (!requesterMembership) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const members = await prisma.teamMember.findMany({
      where: { teamId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
