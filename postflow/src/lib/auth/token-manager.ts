import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encryptToken, decryptToken } from "@/lib/encryption";
import { exchangeForLongLivedToken } from "./meta-oauth";

// Refresh a long-lived token if it expires within 7 days
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

interface StorableAccount {
  userId: string;
  platform: Platform;
  platformAccountId: string;
  accountName: string;
  token: string;
  tokenExpiresAt?: Date | null;
  scopes: string;
}

interface RefreshableAccount {
  id: string;
  encryptedToken: string;
  tokenExpiresAt: Date | null;
}

/**
 * Decrypts the stored token for a social account.
 * Must only be called server-side.
 */
export function getDecryptedToken(account: RefreshableAccount): string {
  return decryptToken(account.encryptedToken);
}

/**
 * Returns the decrypted token, refreshing it first if it is close to expiry.
 * Only applicable to long-lived Meta user tokens (Facebook/Threads).
 * Page tokens and Instagram tokens never expire and are not refreshed here.
 */
export async function getTokenWithRefresh(
  account: RefreshableAccount
): Promise<string> {
  const decryptedToken = decryptToken(account.encryptedToken);

  if (!account.tokenExpiresAt) {
    // No expiry set — token never expires (e.g. page token)
    return decryptedToken;
  }

  const msUntilExpiry = account.tokenExpiresAt.getTime() - Date.now();
  if (msUntilExpiry > REFRESH_THRESHOLD_MS) {
    return decryptedToken;
  }

  // Token is close to expiry — refresh it
  const { accessToken: newToken, expiresIn } =
    await exchangeForLongLivedToken(decryptedToken);

  const newExpiresAt = new Date(Date.now() + expiresIn * 1000);
  const encrypted = encryptToken(newToken);

  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      encryptedToken: encrypted,
      tokenExpiresAt: newExpiresAt,
    },
  });

  return newToken;
}

/**
 * Creates or updates a SocialAccount record with an encrypted token.
 * Uses upsert on the (userId, platform, platformAccountId) unique constraint.
 */
export async function storeOrUpdateSocialAccount(
  input: StorableAccount
): Promise<void> {
  const {
    userId,
    platform,
    platformAccountId,
    accountName,
    token,
    tokenExpiresAt,
    scopes,
  } = input;

  const encryptedToken = encryptToken(token);

  await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformAccountId: {
        userId,
        platform,
        platformAccountId,
      },
    },
    update: {
      accountName,
      encryptedToken,
      tokenExpiresAt: tokenExpiresAt ?? null,
      scopes,
      isActive: true,
    },
    create: {
      userId,
      platform,
      platformAccountId,
      accountName,
      encryptedToken,
      tokenExpiresAt: tokenExpiresAt ?? null,
      scopes,
      isActive: true,
    },
  });
}
