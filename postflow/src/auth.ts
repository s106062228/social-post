import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { verifyTotpChallengeToken } from "@/lib/totp";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            totpEnabled: true,
          },
        });

        if (!user || !user.password) return null;

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          totpEnabled: user.totpEnabled,
          // If TOTP is not enabled, mark as already verified
          totpVerified: !user.totpEnabled,
        };
      },
    }),
  ],
  callbacks: {
    authorized({ auth: session, request: { nextUrl } }) {
      const isLoggedIn = !!session?.user;
      const isAuthPath =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/register");
      const is2faPath = nextUrl.pathname === "/2fa";

      const totpEnabled =
        (session?.user as { totpEnabled?: boolean })?.totpEnabled ?? false;
      const totpVerified =
        (session?.user as { totpVerified?: boolean })?.totpVerified ?? true;

      if (isAuthPath) {
        if (isLoggedIn && (!totpEnabled || totpVerified)) {
          return Response.redirect(new URL("/", nextUrl));
        }
        // Allow login/register even if logged-in-but-pending-2fa
        return true;
      }

      if (is2faPath) {
        if (!isLoggedIn) return Response.redirect(new URL("/login", nextUrl));
        // Already fully authenticated → redirect to home
        if (!totpEnabled || totpVerified)
          return Response.redirect(new URL("/", nextUrl));
        return true;
      }

      // Public share pages don't need auth
      if (nextUrl.pathname.startsWith("/share/")) {
        return true;
      }

      if (!isLoggedIn) return false;

      // Logged in but 2FA not yet verified → send to challenge page
      if (totpEnabled && !totpVerified) {
        return Response.redirect(new URL("/2fa", nextUrl));
      }

      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.totpEnabled =
          (user as { totpEnabled?: boolean }).totpEnabled ?? false;
        token.totpVerified =
          (user as { totpVerified?: boolean }).totpVerified ?? true;
      }
      // Accept a verified TOTP challenge token from the /2fa page
      if (
        trigger === "update" &&
        typeof session?.verificationToken === "string" &&
        typeof token.id === "string"
      ) {
        const valid = await verifyTotpChallengeToken(
          session.verificationToken as string,
          token.id
        );
        if (valid) {
          token.totpVerified = true;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string" && session.user) {
        session.user.id = token.id;
        session.user.totpEnabled =
          (token.totpEnabled as boolean | undefined) ?? false;
        session.user.totpVerified =
          (token.totpVerified as boolean | undefined) ?? true;
      }
      return session;
    },
  },
});
