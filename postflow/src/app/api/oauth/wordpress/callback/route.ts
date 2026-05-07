import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  exchangeWordPressCode,
  getWordPressSites,
  WORDPRESS_SCOPES,
  serializeWordPressToken,
} from "@/lib/auth/wordpress-oauth";
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
    resp.cookies.delete("wordpress_oauth_state");
    return resp;
  }

  if (!code || !state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=missing_params", request.url)
    );
    resp.cookies.delete("wordpress_oauth_state");
    return resp;
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("wordpress_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    const resp = NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
    resp.cookies.delete("wordpress_oauth_state");
    return resp;
  }

  const userId = session.user.id;

  try {
    const { accessToken, blogId, blogUrl } = await exchangeWordPressCode(code);

    // Fetch user's sites to get the primary site info
    const sites = await getWordPressSites(accessToken);

    // Use the site returned by token exchange if available, else first in list
    let primarySite = sites[0];
    if (blogId) {
      const matched = sites.find((s) => s.id === blogId);
      if (matched) primarySite = matched;
    }

    const siteId = primarySite?.id ?? blogId ?? "unknown";
    const siteUrl = primarySite?.url ?? blogUrl ?? "";
    const blogName = primarySite?.name ?? siteUrl;

    const serializedToken = serializeWordPressToken({
      accessToken,
      siteId,
      siteUrl,
      blogName,
    });

    await storeOrUpdateSocialAccount({
      userId,
      platform: "WORDPRESS",
      platformAccountId: siteId,
      accountName: blogName,
      token: serializedToken,
      scopes: WORDPRESS_SCOPES,
    });

    const successResp = NextResponse.redirect(
      new URL("/accounts?success=connected", request.url)
    );
    successResp.cookies.delete("wordpress_oauth_state");
    return successResp;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    oauthLogger.error({ err }, `WordPress callback error: ${message}`);

    const errorResp = NextResponse.redirect(
      new URL("/accounts?error=oauth_failed", request.url)
    );
    errorResp.cookies.delete("wordpress_oauth_state");
    return errorResp;
  }
}
