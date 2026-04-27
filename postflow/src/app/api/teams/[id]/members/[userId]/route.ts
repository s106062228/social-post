import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const updateRoleSchema = z.object({
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
});

type RouteContext = { params: Promise<{ id: string; userId: string }> };

// ── PATCH /api/teams/[id]/members/[userId] ────────────────────────────────────

export async function PATCH(
  request: NextRequest,
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

    const { id, userId } = await params;

    const requesterMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: id, userId: session.user.id } },
    });

    if (!requesterMembership) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (requesterMembership.role !== "OWNER" && requesterMembership.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: id, userId } },
    });

    if (!targetMembership) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (targetMembership.role === "OWNER") {
      return NextResponse.json(
        { error: "Cannot change the owner's role" },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updated = await prisma.teamMember.update({
      where: { teamId_userId: { teamId: id, userId } },
      data: { role: parsed.data.role },
    });

    return NextResponse.json({ userId, role: updated.role });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/teams/[id]/members/[userId] ───────────────────────────────────

export async function DELETE(
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

    const { id, userId } = await params;

    const requesterMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: id, userId: session.user.id } },
    });

    if (!requesterMembership) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const isSelf = session.user.id === userId;

    if (!isSelf && requesterMembership.role !== "OWNER" && requesterMembership.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: id, userId } },
    });

    if (!targetMembership) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (targetMembership.role === "OWNER") {
      return NextResponse.json(
        { error: "The team owner cannot be removed. Transfer ownership or delete the team." },
        { status: 400 }
      );
    }

    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId: id, userId } },
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
