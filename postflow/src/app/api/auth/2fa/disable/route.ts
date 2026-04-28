import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  decryptTotpSecret,
  verifyTotpCode,
  findMatchingBackupCode,
} from "@/lib/totp";

const bodySchema = z.object({
  code: z.string().min(6).max(14),
});

/** POST /api/auth/2fa/disable — verify code then turn off 2FA */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json(
      { error: "2FA is not enabled" },
      { status: 400 }
    );
  }

  const secretBase32 = decryptTotpSecret(user.totpSecret);
  const isTotpValid = verifyTotpCode(parsed.data.code, secretBase32);
  const matchedBackup = isTotpValid
    ? null
    : findMatchingBackupCode(parsed.data.code, user.totpBackupCodes);

  if (!isTotpValid && !matchedBackup) {
    return NextResponse.json({ error: "Invalid code" }, { status: 422 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpBackupCodes: [],
    },
  });

  return NextResponse.json({ ok: true });
}
