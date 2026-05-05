import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  exchangeLinkedInCode,
  getLinkedInProfile,
  LINKEDIN_SCOPES,
} from "@/lib/auth/linkedin-oauth";
import { storeOrUpdateSocialAccount } from "@/lib/auth/token-manager";
import { oauthLogger } from "@/lib/logger";

/**
 * GET /api/oauth/linkedin/callback
 *
 * Handles the LinkedIn OAuth 2.0 redirect after user consent.
 *
 * Flow:
 *  1. Verify CSRF state cookie
 *  2. Exchange authorization code for access token (~60 days)
 *  3. Fetch LinkedIn user profile (sub = urn:li:person:{id})
 *  4. Store encrypted token in SocialAccount table
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
    resp.cookies.delete("linkedin_oauth_state");
    return resp;
  }

  if (!code || !state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=missing_params", request.url)
    );
    resp.cookies.delete("linkedin_oauth_state");
    return resp;
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("linkedin_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
    resp.cookies.delete("linkedin_oauth_state");
    return resp;
  }

  const userId = session.user.id;

  try {
    const { accessToken, expiresIn } = await exchangeLinkedInCode(code);

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    const profile = await getLinkedInProfile(accessToken);

    const fullName = [profile.given_name, profile.family_name]
      .filter(Boolean)
      .join(" ");
    const displayName = profile.name ?? (fullName || profile.sub);

    await storeOrUpdateSocialAccount({
      userId,
      platform: "LINKEDIN",
      platformAccountId: profile.sub,
      accountName: displayName,
      token: accessToken,
      tokenExpiresAt,
      scopes: LINKEDIN_SCOPES,
    });

    const successResp = NextResponse.redirect(
      new URL("/accounts?success=connected", request.url)
    );
    successResp.cookies.delete("linkedin_oauth_state");
    return successResp;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    oauthLogger.error({ err }, `LinkedIn callback error: ${message}`);

    const errorResp = NextResponse.redirect(
      new URL("/accounts?error=oauth_failed", request.url)
    );
    errorResp.cookies.delete("linkedin_oauth_state");
    return errorResp;
  }
}
