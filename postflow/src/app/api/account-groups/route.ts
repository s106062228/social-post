import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  accountIds: z.array(z.string()).max(50),
});

const MAX_GROUPS = 20;

// ── GET /api/account-groups ───────────────────────────────────────────────────

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

    const groups = await prisma.accountGroup.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, accountIds: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ groups });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/account-groups ──────────────────────────────────────────────────

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

    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const count = await prisma.accountGroup.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_GROUPS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_GROUPS} account groups allowed` },
        { status: 422 }
      );
    }

    // Validate that all accountIds belong to the current user
    if (parsed.data.accountIds.length > 0) {
      const ownedAccounts = await prisma.socialAccount.findMany({
        where: {
          userId: session.user.id,
          id: { in: parsed.data.accountIds },
          isActive: true,
        },
        select: { id: true },
      });
      const ownedIds = new Set(ownedAccounts.map((a) => a.id));
      const invalid = parsed.data.accountIds.filter((id) => !ownedIds.has(id));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: "Some accountIds do not belong to current user" },
          { status: 400 }
        );
      }
    }

    const group = await prisma.accountGroup.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name.trim(),
        accountIds: parsed.data.accountIds,
      },
      select: { id: true, name: true, accountIds: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(group, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
