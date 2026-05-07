import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  exchangeRedditCode,
  getRedditUser,
  REDDIT_SCOPES,
  serializeRedditToken,
} from "@/lib/auth/reddit-oauth";
import { storeOrUpdateSocialAccount } from "@/lib/auth/token-manager";
import { oauthLogger } from "@/lib/logger";

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
    resp.cookies.delete("reddit_oauth_state");
    return resp;
  }

  if (!code || !state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=missing_params", request.url)
    );
    resp.cookies.delete("reddit_oauth_state");
    return resp;
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("reddit_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
    resp.cookies.delete("reddit_oauth_state");
    return resp;
  }

  const userId = session.user.id;

  try {
    const { accessToken, refreshToken, expiresIn } =
      await exchangeRedditCode(code);

    const tokenExpiresAt =
      expiresIn != null ? new Date(Date.now() + expiresIn * 1000) : undefined;

    const userInfo = await getRedditUser(accessToken);

    const serializedToken = serializeRedditToken({
      accessToken,
      refreshToken,
      username: userInfo.username,
      subreddits: userInfo.subreddits,
    });

    await storeOrUpdateSocialAccount({
      userId,
      platform: "REDDIT",
      platformAccountId: userInfo.id,
      accountName: `u/${userInfo.username}`,
      token: serializedToken,
      tokenExpiresAt,
      scopes: REDDIT_SCOPES,
    });

    const successResp = NextResponse.redirect(
      new URL("/accounts?success=connected", request.url)
    );
    successResp.cookies.delete("reddit_oauth_state");
    return successResp;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    oauthLogger.error({ err }, `Reddit callback error: ${message}`);

    const errorResp = NextResponse.redirect(
      new URL("/accounts?error=oauth_failed", request.url)
    );
    errorResp.cookies.delete("reddit_oauth_state");
    return errorResp;
  }
}
