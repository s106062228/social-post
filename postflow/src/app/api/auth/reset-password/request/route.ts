import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const resetLogger = logger.child({ context: "reset-password" });

const bodySchema = z.object({
  email: z.string().email(),
});

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * POST /api/auth/reset-password/request
 * Always returns 200 to prevent email enumeration.
 */
export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, password: true },
  });

  if (!user || !user.password) {
    // No account or OAuth-only — still return 200
    return NextResponse.json({ ok: true });
  }

  // Delete any existing tokens for this user before creating a new one
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password/${rawToken}`;

  sendPasswordResetEmail(email, user.name, resetUrl).catch((err: unknown) => {
    resetLogger.error({ err, userId: user.id }, "Failed to send password reset email");
  });

  return NextResponse.json({ ok: true });
}

async function sendPasswordResetEmail(
  email: string,
  name: string | null,
  resetUrl: string
): Promise<void> {
  const displayName = name ?? email;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2>Reset your PostFlow password</h2>
      <p>Hi ${displayName},</p>
      <p>We received a request to reset your password. Click the button below to choose a new one.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}"
           style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
          Reset Password
        </a>
      </p>
      <p style="color:#6b7280;font-size:14px">This link will expire in 1 hour.</p>
      <p style="color:#6b7280;font-size:14px">If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: "Reset your PostFlow password",
    html,
  });
}
