import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  exchangeTikTokCode,
  getTikTokUserInfo,
  TIKTOK_SCOPES,
} from "@/lib/auth/tiktok-oauth";
import { storeOrUpdateSocialAccount } from "@/lib/auth/token-manager";
import { oauthLogger } from "@/lib/logger";

/**
 * GET /api/oauth/tiktok/callback
 *
 * Handles the TikTok OAuth 2.0 redirect after user consent.
 *
 * Flow:
 *  1. Verify CSRF state cookie
 *  2. Exchange authorization code for access + refresh tokens
 *  3. Fetch TikTok user info (open_id = platformAccountId)
 *  4. Store encrypted token in SocialAccount
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    const description = errorDescription ?? error;
    const dest = new URL(
      `/accounts?error=${encodeURIComponent(description)}`,
      request.url
    );
    const resp = NextResponse.redirect(dest);
    resp.cookies.delete("tiktok_oauth_state");
    return resp;
  }

  if (!code || !state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=missing_params", request.url)
    );
    resp.cookies.delete("tiktok_oauth_state");
    return resp;
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("tiktok_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
    resp.cookies.delete("tiktok_oauth_state");
    return resp;
  }

  const userId = session.user.id;

  try {
    const { accessToken, refreshToken, expiresIn, openId } =
      await exchangeTikTokCode(code);

    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : undefined;

    const userInfo = await getTikTokUserInfo(accessToken);

    // Store the access token; if a refresh token was granted, append it
    // so the token-manager can refresh later: format "access:refresh"
    const storedToken = refreshToken
      ? `${accessToken}:${refreshToken}`
      : accessToken;

    await storeOrUpdateSocialAccount({
      userId,
      platform: "TIKTOK",
      platformAccountId: openId,
      accountName: userInfo.displayName,
      token: storedToken,
      tokenExpiresAt: tokenExpiresAt ?? null,
      scopes: TIKTOK_SCOPES,
    });

    const successResp = NextResponse.redirect(
      new URL("/accounts?success=connected", request.url)
    );
    successResp.cookies.delete("tiktok_oauth_state");
    return successResp;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    oauthLogger.error({ err }, `TikTok callback error: ${message}`);

    const errorResp = NextResponse.redirect(
      new URL("/accounts?error=oauth_failed", request.url)
    );
    errorResp.cookies.delete("tiktok_oauth_state");
    return errorResp;
  }
}
