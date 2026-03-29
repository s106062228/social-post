import { auth } from "@/auth";

// Re-export auth as proxy for Next.js 16 route protection.
// The authorized callback in auth.ts handles redirect logic.
export { auth as proxy };

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
