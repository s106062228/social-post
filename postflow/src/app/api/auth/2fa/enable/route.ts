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

/** POST /api/auth/2fa/enable — verify code and activate 2FA */
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
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!user || !user.totpSecret) {
    return NextResponse.json(
      { error: "Run /api/auth/2fa/setup first" },
      { status: 400 }
    );
  }
  if (user.totpEnabled) {
    return NextResponse.json(
      { error: "2FA is already enabled" },
      { status: 409 }
    );
  }

  const secretBase32 = decryptTotpSecret(user.totpSecret);
  if (!verifyTotpCode(parsed.data.code, secretBase32)) {
    return NextResponse.json(
      { error: "Invalid verification code" },
      { status: 422 }
    );
  }

  const backupCodes = generateBackupCodes();
  const hashedCodes = backupCodes.map(hashBackupCode);

  await prisma.user.update({
    where: { id: userId },
    data: {
      totpEnabled: true,
      totpBackupCodes: hashedCodes,
    },
  });

  return NextResponse.json({ backupCodes });
}
