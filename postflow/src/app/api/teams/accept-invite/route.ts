import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

// ── POST /api/teams/accept-invite ─────────────────────────────────────────────

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

    const parsed = acceptInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const invite = await prisma.teamInvite.findUnique({
      where: { token: parsed.data.token },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
    }

    if (invite.expiresAt < new Date()) {
      await prisma.teamInvite.delete({ where: { id: invite.id } });
      return NextResponse.json({ error: "Invite has expired" }, { status: 410 });
    }

    const existing = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: invite.teamId, userId: session.user.id } },
    });

    if (existing) {
      return NextResponse.json({ error: "Already a member of this team" }, { status: 409 });
    }

    const member = await prisma.$transaction(async (tx) => {
      const m = await tx.teamMember.create({
        data: { teamId: invite.teamId, userId: session.user!.id!, role: invite.role },
      });
      await tx.teamInvite.delete({ where: { id: invite.id } });
      return m;
    });

    return NextResponse.json({ teamId: member.teamId, role: member.role }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
