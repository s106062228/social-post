import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { logActivity } from "@/lib/activity-log";

const accountIdSchema = z.string().cuid();

// ── DELETE /api/accounts/[id] ─────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!accountIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const account = await prisma.socialAccount.findUnique({ where: { id } });
    if (!account || account.userId !== session.user.id) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!account.isActive) {
      return NextResponse.json(
        { error: "Account already disconnected" },
        { status: 409 }
      );
    }

    await prisma.socialAccount.update({
      where: { id },
      data: { isActive: false },
    });

    logActivity({
      userId: session.user.id,
      action: "account.disconnected",
      entityId: id,
      entityType: "account",
      metadata: { platform: account.platform, accountName: account.accountName },
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
