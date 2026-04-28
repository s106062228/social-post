import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  decryptTotpSecret,
  verifyTotpCode,
  findMatchingBackupCode,
  createTotpChallengeToken,
} from "@/lib/totp";

const bodySchema = z.object({
  code: z.string().min(6).max(14),
});

/**
 * POST /api/auth/2fa/challenge — verify TOTP during login.
 * Returns a short-lived HMAC token the client passes to session.update()
 * to promote the JWT to totpVerified=true.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // This endpoint is only valid for sessions with a pending TOTP verification
  if (session.user.totpVerified) {
    return NextResponse.json(
      { error: "2FA already verified" },
      { status: 400 }
    );
  }

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userId = session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true, totpBackupCodes: true },
  });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ error: "2FA not configured" }, { status: 400 });
  }

  const secretBase32 = decryptTotpSecret(user.totpSecret);
  const isTotpValid = verifyTotpCode(parsed.data.code, secretBase32);

  if (!isTotpValid) {
    const matchedBackup = findMatchingBackupCode(
      parsed.data.code,
      user.totpBackupCodes
    );
    if (!matchedBackup) {
      return NextResponse.json({ error: "Invalid code" }, { status: 422 });
    }
    // Consume the backup code
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpBackupCodes: user.totpBackupCodes.filter(
          (h: string) => h !== matchedBackup
        ),
      },
    });
  }

  const verificationToken = await createTotpChallengeToken(userId);
  return NextResponse.json({ verificationToken });
}
