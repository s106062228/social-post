import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { decryptToken } from "@/lib/encryption";
import { handleRouteError } from "@/lib/errors";

const accountIdSchema = z.string().cuid();

// ── POST /api/accounts/[id]/check ─────────────────────────────────────────────

export async function POST(
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
    if (!account || account.userId !== session.user.id || !account.isActive) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let token: string;
    try {
      token = decryptToken(account.encryptedToken);
    } catch {
      return NextResponse.json(
        { valid: false, error: "Token decryption failed" },
        { status: 200 }
      );
    }

    const baseUrl =
      account.platform === Platform.THREADS
        ? "https://graph.threads.net"
        : "https://graph.facebook.com";

    let valid = false;
    let checkError: string | undefined;

    try {
      const resp = await fetch(
        `${baseUrl}/v21.0/me?fields=id,name&access_token=${token}`
      );
      if (resp.ok) {
        valid = true;
      } else {
        const body = (await resp.json()) as { error?: { message?: string } };
        checkError = body.error?.message ?? "Token validation failed";
      }
    } catch (fetchErr) {
      checkError =
        fetchErr instanceof Error ? fetchErr.message : "Network error";
    }

    return NextResponse.json({
      valid,
      platform: account.platform,
      accountName: account.accountName,
      tokenExpiresAt: account.tokenExpiresAt,
      ...(checkError !== undefined && { error: checkError }),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
