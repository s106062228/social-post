import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getUserPages,
  getPageInstagramAccount,
  getThreadsUser,
  META_SCOPES,
} from "@/lib/auth/meta-oauth";
import { storeOrUpdateSocialAccount } from "@/lib/auth/token-manager";

/**
 * GET /api/oauth/meta/callback
 *
 * Handles the Meta OAuth 2.0 redirect after user consent.
 *
 * Flow:
 *  1. Verify CSRF state cookie
 *  2. Exchange authorization code for short-lived user token
 *  3. Exchange short-lived token for long-lived token (~60 days)
 *  4. Fetch Facebook Pages → store page tokens (never expire)
 *  5. For each Page, check for linked Instagram Business Account → store
 *  6. Fetch Threads user with the long-lived token → store
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

  // User denied permission or Meta returned an error
  if (error) {
    const description = errorDescription ?? error;
    const dest = new URL(
      `/accounts?error=${encodeURIComponent(description)}`,
      request.url
    );
    const resp = NextResponse.redirect(dest);
    resp.cookies.delete("meta_oauth_state");
    return resp;
  }

  // Missing required parameters
  if (!code || !state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=missing_params", request.url)
    );
    resp.cookies.delete("meta_oauth_state");
    return resp;
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const storedState = cookieStore.get("meta_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
    resp.cookies.delete("meta_oauth_state");
    return resp;
  }

  const userId = session.user.id;

  try {
    const callbackUrl = process.env.META_OAUTH_CALLBACK_URL;
    if (!callbackUrl) {
      throw new Error("META_OAUTH_CALLBACK_URL is not configured");
    }

    // Step 1: Exchange authorization code for short-lived token (1 hr)
    const { accessToken: shortLivedToken } =
      await exchangeCodeForShortLivedToken(code, callbackUrl);

    // Step 2: Exchange for long-lived token (~60 days)
    const { accessToken: longLivedToken, expiresIn } =
      await exchangeForLongLivedToken(shortLivedToken);

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Step 3: Get Facebook Pages the user manages
    const pages = await getUserPages(longLivedToken);

    // Step 4: Store each Facebook Page + check for Instagram Business Account
    for (const page of pages) {
      // Page tokens derived from a long-lived user token never expire
      await storeOrUpdateSocialAccount({
        userId,
        platform: "FACEBOOK",
        platformAccountId: page.id,
        accountName: page.name,
        token: page.access_token,
        tokenExpiresAt: null,
        scopes: META_SCOPES,
      });

      // Check if this Page has a linked Instagram Business / Creator account
      const pageData = await getPageInstagramAccount(
        page.id,
        page.access_token
      );

      if (pageData.instagram_business_account?.id) {
        await storeOrUpdateSocialAccount({
          userId,
          platform: "INSTAGRAM",
          platformAccountId: pageData.instagram_business_account.id,
          accountName: `${page.name} (Instagram)`,
          token: page.access_token,
          tokenExpiresAt: null,
          scopes: META_SCOPES,
        });
      }
    }

    // Step 5: Get Threads user and store (same long-lived token, different base URL)
    try {
      const threadsUser = await getThreadsUser(longLivedToken);
      const displayName =
        threadsUser.username ?? threadsUser.name ?? threadsUser.id;

      await storeOrUpdateSocialAccount({
        userId,
        platform: "THREADS",
        platformAccountId: threadsUser.id,
        accountName: displayName,
        token: longLivedToken,
        tokenExpiresAt,
        scopes: META_SCOPES,
      });
    } catch {
      // Threads may be unavailable if the user has no Threads account
      // or if the scope was not granted. Don't fail the entire OAuth flow.
    }

    const successResp = NextResponse.redirect(
      new URL("/accounts?success=connected", request.url)
    );
    successResp.cookies.delete("meta_oauth_state");
    return successResp;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("OAuth callback error:", message);

    const errorResp = NextResponse.redirect(
      new URL("/accounts?error=oauth_failed", request.url)
    );
    errorResp.cookies.delete("meta_oauth_state");
    return errorResp;
  }
}
