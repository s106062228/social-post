import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { buildOAuthUrl } from "@/lib/auth/meta-oauth";

/**
 * GET /api/oauth/meta/connect
 *
 * Initiates the Meta OAuth 2.0 flow. Requires the user to be authenticated.
 * Generates a CSRF state token, stores it in an httpOnly cookie, and redirects
 * the browser to the Meta OAuth consent dialog.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Generate a random CSRF state token
    const state = randomBytes(32).toString("hex");
    const oauthUrl = buildOAuthUrl(state);

    // Redirect to Meta OAuth dialog, setting the state cookie
    const response = NextResponse.redirect(oauthUrl);
    response.cookies.set("meta_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600, // 10 minutes — enough time to complete OAuth
      path: "/",
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Configuration error";
    console.error("[OAuth] connect error:", message, err);

    const url = new URL("/accounts?error=config_error", request.url);
    return NextResponse.redirect(url);
  }
}
