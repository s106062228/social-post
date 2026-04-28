import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  decryptTotpSecret,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCode,
} from "@/lib/totp";

const bodySchema = z.object({
  code: z.string().min(6).max(8),
});

/** POST /api/auth/2fa/backup-codes — regenerate backup codes (requires TOTP) */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.totpVerified) {
    return NextResponse.json({ error: "2FA not verified" }, { status: 403 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userId = session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ error: "2FA not enabled" }, { status: 400 });
  }

  const secretBase32 = decryptTotpSecret(user.totpSecret);
  if (!verifyTotpCode(parsed.data.code, secretBase32)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 422 });
  }

  const backupCodes = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { totpBackupCodes: backupCodes.map(hashBackupCode) },
  });

  return NextResponse.json({ backupCodes });
}
