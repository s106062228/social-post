import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  generateTotpSecret,
  encryptTotpSecret,
  decryptTotpSecret,
  getTotpUri,
  generateQrCodeDataUrl,
} from "@/lib/totp";

/** GET /api/auth/2fa/setup — returns QR code + secret for the authenticator app */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, totpSecret: true, totpEnabled: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Generate a fresh secret for setup (or reuse an unconfirmed one)
  let secretBase32: string;
  if (user.totpSecret && !user.totpEnabled) {
    secretBase32 = decryptTotpSecret(user.totpSecret);
  } else {
    secretBase32 = generateTotpSecret();
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptTotpSecret(secretBase32) },
    });
  }

  const uri = getTotpUri(user.email ?? userId, secretBase32);
  const qrCode = await generateQrCodeDataUrl(uri);

  return NextResponse.json({ qrCode, secret: secretBase32 });
}
