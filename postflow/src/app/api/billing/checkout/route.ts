import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createCheckoutSession, isStripeEnabled } from "@/lib/stripe";

const checkoutSchema = z.object({
  priceId: z.string().min(1).optional(),
});

// ── POST /api/billing/checkout ────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
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

    const body = await request.json().catch(() => ({}));
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const priceId = parsed.data.priceId ?? process.env.STRIPE_PRO_PRICE_ID ?? "";
    if (!priceId) {
      return NextResponse.json({ error: "No price ID configured" }, { status: 503 });
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const url = await createCheckoutSession(
      session.user.id,
      session.user.email,
      priceId,
      `${baseUrl}/billing?success=1`,
      `${baseUrl}/billing?canceled=1`
    );

    if (!url) {
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }

    return NextResponse.json({ url }, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    return handleRouteError(err);
  }
}
