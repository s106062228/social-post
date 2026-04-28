import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { encryptToken, decryptToken } from "@/lib/encryption";
import { createHash, randomBytes } from "crypto";

const ISSUER = "PostFlow";

export function generateTotpSecret(): string {
  const secret = new OTPAuth.Secret();
  return secret.base32;
}

export function getTotpUri(email: string, secretBase32: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.toString();
}

export async function generateQrCodeDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri);
}

export function verifyTotpCode(code: string, secretBase32: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: "",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
  return delta !== null;
}

export function encryptTotpSecret(secretBase32: string): string {
  return encryptToken(secretBase32);
}

export function decryptTotpSecret(encrypted: string): string {
  return decryptToken(encrypted);
}

/** Generate 10 random backup codes in XXXXX-XXXXX format */
export function generateBackupCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const part1 = randomBytes(3).toString("hex").toUpperCase();
    const part2 = randomBytes(3).toString("hex").toUpperCase();
    return `${part1}-${part2}`;
  });
}

/** SHA-256 hash a backup code for storage */
export function hashBackupCode(code: string): string {
  return createHash("sha256")
    .update(code.toUpperCase().replace(/\s/g, ""))
    .digest("hex");
}

/** Verify a backup code against stored hashes. Returns the matched hash or null. */
export function findMatchingBackupCode(
  inputCode: string,
  storedHashes: string[]
): string | null {
  const hash = hashBackupCode(inputCode);
  const match = storedHashes.find((h) => h === hash);
  return match ?? null;
}

/**
 * Create a short-lived HMAC verification token used to confirm a completed
 * TOTP challenge server-side, before accepting the JWT update.
 */
export async function createTotpChallengeToken(userId: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `${userId}:${timestamp}`;
  const secret = process.env.NEXTAUTH_SECRET ?? "";

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return Buffer.from(`${payload}:${sigHex}`).toString("base64url");
}

/**
 * Verify a TOTP challenge token created by createTotpChallengeToken.
 * Valid for 60 seconds.
 */
export async function verifyTotpChallengeToken(
  token: string,
  userId: string
): Promise<boolean> {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon === -1) return false;

    const payload = decoded.slice(0, lastColon);
    const sigHex = decoded.slice(lastColon + 1);

    const parts = payload.split(":");
    if (parts.length !== 2) return false;
    const [tokenUserId, timestamp] = parts;

    if (tokenUserId !== userId) return false;

    const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (age < 0 || age > 60) return false;

    const secret = process.env.NEXTAUTH_SECRET ?? "";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const expectedBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload)
    );
    const expectedHex = Array.from(new Uint8Array(expectedBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return sigHex === expectedHex;
  } catch {
    return false;
  }
}
