jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
    },
    PrismaClientValidationError: class PrismaClientValidationError extends Error {},
    PrismaClientInitializationError: class PrismaClientInitializationError extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Mock Stripe service
jest.mock("@/lib/stripe", () => ({
  isStripeEnabled: jest.fn(),
  createCheckoutSession: jest.fn(),
  createPortalSession: jest.fn(),
  syncSubscription: jest.fn(),
  getStripeClient: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET as getStatus } from "@/app/api/billing/status/route";
import { POST as postCheckout } from "@/app/api/billing/checkout/route";
import { POST as postPortal } from "@/app/api/billing/portal/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import {
  isStripeEnabled,
  createCheckoutSession,
  createPortalSession,
} from "@/lib/stripe";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockIsStripeEnabled = isStripeEnabled as jest.Mock;
const mockCreateCheckoutSession = createCheckoutSession as jest.Mock;
const mockCreatePortalSession = createPortalSession as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

// ── GET /api/billing/status ───────────────────────────────────────────────────

describe("GET /api/billing/status", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest() {
    return new NextRequest("http://localhost:3000/api/billing/status");
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getStatus(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await getStatus(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns billing status for free user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsStripeEnabled.mockReturnValueOnce(false);
    mockUserFindUnique.mockResolvedValueOnce({
      stripeCustomerId: null,
      planTier: "free",
      planExpiresAt: null,
    });

    const res = await getStatus(makeRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      planTier: string;
      planExpiresAt: null;
      stripeCustomerId: null;
      stripeEnabled: boolean;
    };
    expect(data.planTier).toBe("free");
    expect(data.planExpiresAt).toBeNull();
    expect(data.stripeCustomerId).toBeNull();
    expect(data.stripeEnabled).toBe(false);
  });

  it("returns billing status for pro user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsStripeEnabled.mockReturnValueOnce(true);
    const expiresAt = new Date("2026-12-31T00:00:00Z");
    mockUserFindUnique.mockResolvedValueOnce({
      stripeCustomerId: "cus_abc123",
      planTier: "pro",
      planExpiresAt: expiresAt,
    });

    const res = await getStatus(makeRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      planTier: string;
      planExpiresAt: string;
      stripeCustomerId: string;
      stripeEnabled: boolean;
    };
    expect(data.planTier).toBe("pro");
    expect(data.stripeCustomerId).toBe("cus_abc123");
    expect(data.stripeEnabled).toBe(true);
  });
});

// ── POST /api/billing/checkout ────────────────────────────────────────────────

describe("POST /api/billing/checkout", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body?: object) {
    return new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      body: body ? JSON.stringify(body) : JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await postCheckout(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await postCheckout(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 503 when Stripe is not configured", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsStripeEnabled.mockReturnValueOnce(false);
    const res = await postCheckout(makeRequest());
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns checkout URL when Stripe is configured", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsStripeEnabled.mockReturnValueOnce(true);
    process.env.STRIPE_PRO_PRICE_ID = "price_test123";
    mockCreateCheckoutSession.mockResolvedValueOnce("https://checkout.stripe.com/test");

    const res = await postCheckout(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { url: string };
    expect(data.url).toBe("https://checkout.stripe.com/test");
    delete process.env.STRIPE_PRO_PRICE_ID;
  });

  it("returns 503 when no price ID is configured", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsStripeEnabled.mockReturnValueOnce(true);
    delete process.env.STRIPE_PRO_PRICE_ID;
    const res = await postCheckout(makeRequest());
    expect(res.status).toBe(503);
  });
});

// ── POST /api/billing/portal ──────────────────────────────────────────────────

describe("POST /api/billing/portal", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest() {
    return new NextRequest("http://localhost:3000/api/billing/portal", {
      method: "POST",
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await postPortal(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await postPortal(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 503 when Stripe is not configured", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsStripeEnabled.mockReturnValueOnce(false);
    const res = await postPortal(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns 400 when user has no stripe customer ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsStripeEnabled.mockReturnValueOnce(true);
    mockUserFindUnique.mockResolvedValueOnce({ stripeCustomerId: null });
    const res = await postPortal(makeRequest());
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/billing account/i);
  });

  it("returns portal URL when user has stripe customer ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsStripeEnabled.mockReturnValueOnce(true);
    mockUserFindUnique.mockResolvedValueOnce({ stripeCustomerId: "cus_abc123" });
    mockCreatePortalSession.mockResolvedValueOnce("https://billing.stripe.com/portal/test");

    const res = await postPortal(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { url: string };
    expect(data.url).toBe("https://billing.stripe.com/portal/test");
  });
});

// ── POST /api/webhooks/stripe — signature validation ─────────────────────────

describe("POST /api/webhooks/stripe", () => {
  it("returns 503 when Stripe is not configured", async () => {
    // Dynamically import after mocking
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const mockGetStripe = jest.requireMock("@/lib/stripe").getStripeClient as jest.Mock;
    mockGetStripe.mockReturnValueOnce(null);

    const req = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const mockGetStripe = jest.requireMock("@/lib/stripe").getStripeClient as jest.Mock;
    const mockStripeInstance = {
      webhooks: { constructEvent: jest.fn() },
      subscriptions: { retrieve: jest.fn() },
    };
    mockGetStripe.mockReturnValueOnce(mockStripeInstance);
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    const req = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/signature/i);
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("returns 400 when signature verification fails", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const mockGetStripe = jest.requireMock("@/lib/stripe").getStripeClient as jest.Mock;
    const mockStripeInstance = {
      webhooks: {
        constructEvent: jest.fn().mockImplementation(() => {
          throw new Error("Invalid signature");
        }),
      },
    };
    mockGetStripe.mockReturnValueOnce(mockStripeInstance);
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    const req = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "t=bad,v1=invalid" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("returns 200 and syncs subscription on checkout.session.completed", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const mockGetStripe = jest.requireMock("@/lib/stripe").getStripeClient as jest.Mock;
    const mockSyncSub = jest.requireMock("@/lib/stripe").syncSubscription as jest.Mock;
    const mockSubscription = { id: "sub_test", status: "active", customer: "cus_test", items: { data: [] } };
    const mockStripeInstance = {
      webhooks: {
        constructEvent: jest.fn().mockReturnValue({
          type: "checkout.session.completed",
          data: {
            object: {
              mode: "subscription",
              subscription: "sub_test",
            },
          },
        }),
      },
      subscriptions: {
        retrieve: jest.fn().mockResolvedValue(mockSubscription),
      },
    };
    mockGetStripe.mockReturnValueOnce(mockStripeInstance);
    mockSyncSub.mockResolvedValueOnce(undefined);
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    const req = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "stripe-signature": "t=valid,v1=valid" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { received: boolean };
    expect(data.received).toBe(true);
    expect(mockSyncSub).toHaveBeenCalledWith(mockSubscription);
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });
});
