import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createPortalSession, isStripeEnabled } from "@/lib/stripe";

// ── POST /api/billing/portal ──────────────────────────────────────────────────

export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    if (!isStripeEnabled()) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found. Please upgrade first." },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const url = await createPortalSession(user.stripeCustomerId, `${baseUrl}/billing`);

    if (!url) {
      return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 });
    }

    return NextResponse.json({ url }, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    return handleRouteError(err);
  }
}
