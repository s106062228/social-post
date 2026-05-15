import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  accountIds: z.array(z.string()).max(50).optional(),
});

// ── PATCH /api/account-groups/[id] ───────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
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
    if (!id || id.length < 10) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const group = await prisma.accountGroup.findUnique({ where: { id } });
    if (!group || group.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Validate that any new accountIds belong to the current user
    if (parsed.data.accountIds && parsed.data.accountIds.length > 0) {
      const ownedAccounts = await prisma.socialAccount.findMany({
        where: {
          userId: session.user.id,
          id: { in: parsed.data.accountIds },
          isActive: true,
        },
        select: { id: true },
      });
      const ownedIds = new Set(ownedAccounts.map((a) => a.id));
      const invalid = parsed.data.accountIds.filter((aid) => !ownedIds.has(aid));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: "Some accountIds do not belong to current user" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.accountGroup.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name.trim() }),
        ...(parsed.data.accountIds !== undefined && { accountIds: parsed.data.accountIds }),
      },
      select: { id: true, name: true, accountIds: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/account-groups/[id] ──────────────────────────────────────────

export async function DELETE(
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
    if (!id || id.length < 10) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const group = await prisma.accountGroup.findUnique({ where: { id } });
    if (!group || group.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.accountGroup.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
