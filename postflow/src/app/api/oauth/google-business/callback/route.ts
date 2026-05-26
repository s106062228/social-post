import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  exchangeGoogleBusinessCode,
  getGoogleBusinessAccount,
  serializeGoogleBusinessToken,
  GOOGLE_BUSINESS_SCOPES,
} from "@/lib/auth/google-business-oauth";
import { storeOrUpdateSocialAccount } from "@/lib/auth/token-manager";
import { oauthLogger } from "@/lib/logger";

/**
 * GET /api/oauth/google-business/callback
 *
 * Handles the Google Business Profile OAuth 2.0 redirect after user consent.
 *
 * Flow:
 *  1. Verify CSRF state cookie
 *  2. Exchange authorization code for access + refresh tokens
 *  3. Fetch the user's first GBP account and location
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
    resp.cookies.delete("google_business_oauth_state");
    return resp;
  }

  if (!code || !state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=missing_params", request.url)
    );
    resp.cookies.delete("google_business_oauth_state");
    return resp;
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("google_business_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
    resp.cookies.delete("google_business_oauth_state");
    return resp;
  }

  const userId = session.user.id;

  try {
    const { accessToken, refreshToken, expiresIn } =
      await exchangeGoogleBusinessCode(code);

    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : undefined;

    const { accountName, locationName, businessName } =
      await getGoogleBusinessAccount(accessToken);

    const tokenData = serializeGoogleBusinessToken({
      accessToken,
      refreshToken,
      accountName,
      locationName,
      businessName,
    });

    await storeOrUpdateSocialAccount({
      userId,
      platform: "GOOGLE_BUSINESS",
      platformAccountId: locationName,
      accountName: businessName,
      token: tokenData,
      tokenExpiresAt: tokenExpiresAt ?? null,
      scopes: GOOGLE_BUSINESS_SCOPES,
    });

    oauthLogger.info({ userId, locationName }, "Google Business account connected");

    const successResp = NextResponse.redirect(
      new URL("/accounts?success=connected", request.url)
    );
    successResp.cookies.delete("google_business_oauth_state");
    return successResp;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    oauthLogger.error({ err }, `Google Business callback error: ${message}`);

    const errorResp = NextResponse.redirect(
      new URL("/accounts?error=google_business_auth_failed", request.url)
    );
    errorResp.cookies.delete("google_business_oauth_state");
    return errorResp;
  }
}
