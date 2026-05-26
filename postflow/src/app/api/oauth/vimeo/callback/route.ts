import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  exchangeVimeoCode,
  VIMEO_SCOPES,
  serializeVimeoToken,
} from "@/lib/auth/vimeo-oauth";
import { storeOrUpdateSocialAccount } from "@/lib/auth/token-manager";
import { oauthLogger } from "@/lib/logger";

/**
 * GET /api/oauth/vimeo/callback
 *
 * Handles the Vimeo OAuth 2.0 redirect after user consent.
 *
 * Flow:
 *  1. Verify CSRF state cookie
 *  2. Exchange authorization code for access token
 *  3. Fetch Vimeo user info (userId = platformAccountId)
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

  if (error) {
    const resp = NextResponse.redirect(
      new URL(`/accounts?error=${encodeURIComponent(error)}`, request.url)
    );
    resp.cookies.delete("vimeo_oauth_state");
    return resp;
  }

  if (!code || !state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=missing_params", request.url)
    );
    resp.cookies.delete("vimeo_oauth_state");
    return resp;
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("vimeo_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
    resp.cookies.delete("vimeo_oauth_state");
    return resp;
  }

  const userId = session.user.id;

  try {
    const { accessToken, userId: vimeoUserId, name, link } =
      await exchangeVimeoCode(code);

    const tokenData = serializeVimeoToken({
      accessToken,
      userId: vimeoUserId,
      name,
      link,
    });

    await storeOrUpdateSocialAccount({
      userId,
      platform: "VIMEO",
      platformAccountId: vimeoUserId,
      accountName: name,
      token: tokenData,
      tokenExpiresAt: null,
      scopes: VIMEO_SCOPES,
    });

    const successResp = NextResponse.redirect(
      new URL("/accounts?success=connected", request.url)
    );
    successResp.cookies.delete("vimeo_oauth_state");
    return successResp;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    oauthLogger.error({ err }, `Vimeo callback error: ${message}`);

    const errorResp = NextResponse.redirect(
      new URL("/accounts?error=oauth_failed", request.url)
    );
    errorResp.cookies.delete("vimeo_oauth_state");
    return errorResp;
  }
}
