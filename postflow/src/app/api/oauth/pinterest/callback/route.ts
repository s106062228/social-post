import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  exchangePinterestCode,
  getPinterestUserAccount,
  getPinterestBoards,
  PINTEREST_SCOPES,
} from "@/lib/auth/pinterest-oauth";
import { storeOrUpdateSocialAccount } from "@/lib/auth/token-manager";
import { oauthLogger } from "@/lib/logger";

/**
 * GET /api/oauth/pinterest/callback
 *
 * Handles the Pinterest OAuth 2.0 redirect after user consent.
 *
 * Flow:
 *  1. Verify CSRF state cookie
 *  2. Exchange authorization code for access token
 *  3. Fetch Pinterest user account info + first board
 *  4. Store encrypted token; platformAccountId = board ID (used when publishing pins)
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
    resp.cookies.delete("pinterest_oauth_state");
    return resp;
  }

  if (!code || !state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=missing_params", request.url)
    );
    resp.cookies.delete("pinterest_oauth_state");
    return resp;
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("pinterest_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
    resp.cookies.delete("pinterest_oauth_state");
    return resp;
  }

  const userId = session.user.id;

  try {
    const { accessToken, expiresIn } = await exchangePinterestCode(code);

    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : undefined;

    const [userAccount, boards] = await Promise.all([
      getPinterestUserAccount(accessToken),
      getPinterestBoards(accessToken),
    ]);

    if (boards.length === 0) {
      const resp = NextResponse.redirect(
        new URL("/accounts?error=no_boards", request.url)
      );
      resp.cookies.delete("pinterest_oauth_state");
      return resp;
    }

    const firstBoard = boards[0];
    const accountName = `${userAccount.username} / ${firstBoard.name}`;

    await storeOrUpdateSocialAccount({
      userId,
      platform: "PINTEREST",
      platformAccountId: firstBoard.id,
      accountName,
      token: accessToken,
      tokenExpiresAt: tokenExpiresAt ?? null,
      scopes: PINTEREST_SCOPES,
    });

    const successResp = NextResponse.redirect(
      new URL("/accounts?success=connected", request.url)
    );
    successResp.cookies.delete("pinterest_oauth_state");
    return successResp;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    oauthLogger.error({ err }, `Pinterest callback error: ${message}`);

    const errorResp = NextResponse.redirect(
      new URL("/accounts?error=oauth_failed", request.url)
    );
    errorResp.cookies.delete("pinterest_oauth_state");
    return errorResp;
  }
}
