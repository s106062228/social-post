import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import {
  buildTwitterOAuthUrl,
  generateCodeVerifier,
  generateCodeChallenge,
} from "@/lib/auth/twitter-oauth";
import { oauthLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { oauthLogger } from "@/lib/logger";

/**
 * GET /api/oauth/twitter/connect
 *
 * Initiates the Twitter OAuth 2.0 PKCE flow. Requires an authenticated session.
 * Generates a CSRF state token and PKCE code verifier, stores both in httpOnly
 * cookies, then redirects the browser to the Twitter OAuth consent dialog.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rl = await oauthLimiter(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const state = randomBytes(32).toString("hex");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const oauthUrl = buildTwitterOAuthUrl(state, codeChallenge);

    const cookieOpts = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    };

    const response = NextResponse.redirect(oauthUrl);
    response.cookies.set("twitter_oauth_state", state, cookieOpts);
    response.cookies.set("twitter_code_verifier", codeVerifier, cookieOpts);

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Configuration error";
    oauthLogger.error({ err }, `Twitter connect error: ${message}`);

    const url = new URL("/accounts?error=config_error", request.url);
    return NextResponse.redirect(url);
  }
}
