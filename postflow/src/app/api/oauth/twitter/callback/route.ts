import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  exchangeTwitterCode,
  getTwitterUser,
  TWITTER_SCOPES,
} from "@/lib/auth/twitter-oauth";
import { storeOrUpdateSocialAccount } from "@/lib/auth/token-manager";
import { oauthLogger } from "@/lib/logger";

/**
 * GET /api/oauth/twitter/callback
 *
 * Handles the Twitter OAuth 2.0 redirect after user consent.
 *
 * Flow:
 *  1. Verify CSRF state cookie
 *  2. Retrieve PKCE code verifier from cookie
 *  3. Exchange authorization code for access + refresh tokens
 *  4. Fetch Twitter user info (id = platformAccountId)
 *  5. Store encrypted token in SocialAccount
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

  const cookieStore = await cookies();

  function clearAndRedirect(dest: URL): NextResponse {
    const resp = NextResponse.redirect(dest);
    resp.cookies.delete("twitter_oauth_state");
    resp.cookies.delete("twitter_code_verifier");
    return resp;
  }

  if (error) {
    const description = errorDescription ?? error;
    return clearAndRedirect(
      new URL(`/accounts?error=${encodeURIComponent(description)}`, request.url)
    );
  }

  if (!code || !state) {
    return clearAndRedirect(
      new URL("/accounts?error=missing_params", request.url)
    );
  }

  const storedState = cookieStore.get("twitter_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return clearAndRedirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
  }

  const codeVerifier = cookieStore.get("twitter_code_verifier")?.value;
  if (!codeVerifier) {
    return clearAndRedirect(
      new URL("/accounts?error=missing_params", request.url)
    );
  }

  const userId = session.user.id;

  try {
    const { accessToken, refreshToken, expiresIn } =
      await exchangeTwitterCode(code, codeVerifier);

    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : undefined;

    const userInfo = await getTwitterUser(accessToken);

    // Store access token; append refresh token if available: "access:refresh"
    const storedToken = refreshToken
      ? `${accessToken}:${refreshToken}`
      : accessToken;

    await storeOrUpdateSocialAccount({
      userId,
      platform: "TWITTER",
      platformAccountId: userInfo.id,
      accountName: `@${userInfo.username}`,
      token: storedToken,
      tokenExpiresAt: tokenExpiresAt ?? null,
      scopes: TWITTER_SCOPES,
    });

    return clearAndRedirect(
      new URL("/accounts?success=connected", request.url)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    oauthLogger.error({ err }, `Twitter callback error: ${message}`);

    return clearAndRedirect(
      new URL("/accounts?error=oauth_failed", request.url)
    );
  }
}
