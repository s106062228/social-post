import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  exchangeYouTubeCode,
  getYouTubeChannel,
  YOUTUBE_SCOPES,
} from "@/lib/auth/youtube-oauth";
import { storeOrUpdateSocialAccount } from "@/lib/auth/token-manager";
import { oauthLogger } from "@/lib/logger";

/**
 * GET /api/oauth/youtube/callback
 *
 * Handles the YouTube (Google) OAuth 2.0 redirect after user consent.
 *
 * Flow:
 *  1. Verify CSRF state cookie
 *  2. Exchange authorization code for access + refresh tokens
 *  3. Fetch YouTube channel info (channelId = platformAccountId)
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
    resp.cookies.delete("youtube_oauth_state");
    return resp;
  }

  if (!code || !state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=missing_params", request.url)
    );
    resp.cookies.delete("youtube_oauth_state");
    return resp;
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("youtube_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
    resp.cookies.delete("youtube_oauth_state");
    return resp;
  }

  const userId = session.user.id;

  try {
    const { accessToken, refreshToken, expiresIn } =
      await exchangeYouTubeCode(code);

    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : undefined;

    const channel = await getYouTubeChannel(accessToken);

    const accountName = channel.customUrl
      ? `${channel.title} (${channel.customUrl})`
      : channel.title;

    // Store the access token; if a refresh token was granted, append it
    // so the token-manager can refresh later: format "access:refresh"
    const storedToken = refreshToken
      ? `${accessToken}:${refreshToken}`
      : accessToken;

    await storeOrUpdateSocialAccount({
      userId,
      platform: "YOUTUBE",
      platformAccountId: channel.id,
      accountName,
      token: storedToken,
      tokenExpiresAt: tokenExpiresAt ?? null,
      scopes: YOUTUBE_SCOPES,
    });

    const successResp = NextResponse.redirect(
      new URL("/accounts?success=connected", request.url)
    );
    successResp.cookies.delete("youtube_oauth_state");
    return successResp;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    oauthLogger.error({ err }, `YouTube callback error: ${message}`);

    const errorResp = NextResponse.redirect(
      new URL("/accounts?error=oauth_failed", request.url)
    );
    errorResp.cookies.delete("youtube_oauth_state");
    return errorResp;
  }
}
