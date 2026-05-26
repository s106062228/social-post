import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { buildVimeoOAuthUrl } from "@/lib/auth/vimeo-oauth";
import { oauthLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { oauthLogger } from "@/lib/logger";

/**
 * GET /api/oauth/vimeo/connect
 *
 * Initiates the Vimeo OAuth 2.0 flow. Requires an authenticated session.
 * Generates a CSRF state token, stores it in an httpOnly cookie, and redirects
 * the browser to the Vimeo OAuth consent dialog.
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
    const oauthUrl = buildVimeoOAuthUrl(state);

    const response = NextResponse.redirect(oauthUrl);
    response.cookies.set("vimeo_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Configuration error";
    oauthLogger.error({ err }, `Vimeo connect error: ${message}`);

    const url = new URL("/accounts?error=config_error", request.url);
    return NextResponse.redirect(url);
  }
}
