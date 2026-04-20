import { auth } from "@/auth";
import { type NextFetchEvent, NextRequest, NextResponse } from "next/server";

type AuthProxyFn = (
  request: NextRequest,
  event: NextFetchEvent
) => Promise<Response | undefined>;

export async function proxy(
  request: NextRequest,
  event: NextFetchEvent
): Promise<Response | undefined> {
  const requestId = crypto.randomUUID();

  // Stamp the request ID onto downstream headers so route handlers can log it
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const requestWithId = new NextRequest(request.url, {
    method: request.method,
    headers: requestHeaders,
  });

  // Run NextAuth's auth middleware — returns a Response (redirect/block) or
  // undefined to allow the request to proceed
  const authResult = await (auth as unknown as AuthProxyFn)(
    requestWithId,
    event
  );

  if (authResult instanceof Response) {
    const response = new NextResponse(authResult.body, {
      status: authResult.status,
      headers: authResult.headers,
    });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  // Allow through — propagate request ID to route handlers and back to client
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata)
     * - api/auth (NextAuth endpoints — must remain public)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap\\.xml|robots\\.txt|api/auth).*)",
  ],
};
