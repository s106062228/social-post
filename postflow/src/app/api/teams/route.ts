import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
});

// ── GET /api/teams ────────────────────────────────────────────────────────────

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

    const memberships = await prisma.teamMember.findMany({
      where: { userId: session.user.id },
      include: {
        team: {
          include: {
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const teams = memberships.map((m) => ({
      id: m.team.id,
      name: m.team.name,
      ownerId: m.team.ownerId,
      role: m.role,
      memberCount: m.team._count.members,
      createdAt: m.team.createdAt,
    }));

    return NextResponse.json({ teams });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/teams ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name } = parsed.data;

    const team = await prisma.$transaction(async (tx) => {
      const t = await tx.team.create({
        data: { name: name.trim(), ownerId: session.user!.id! },
      });
      await tx.teamMember.create({
        data: { teamId: t.id, userId: session.user!.id!, role: "OWNER" },
      });
      return t;
    });

    return NextResponse.json(
      { id: team.id, name: team.name, ownerId: team.ownerId, role: "OWNER", memberCount: 1, createdAt: team.createdAt },
      { status: 201 }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
