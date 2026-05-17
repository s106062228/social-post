jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  PublishStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PUBLISHED: "PUBLISHED",
    FAILED: "FAILED",
  },
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
    socialAccount: { findMany: jest.fn() },
    publishResult: { findMany: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/account-health/route";
import type { AccountHealthResponse } from "@/app/api/analytics/account-health/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockAccountFindMany = prisma.socialAccount.findMany as jest.Mock;
const mockResultFindMany = prisma.publishResult.findMany as jest.Mock;

const MOCK_USER_ID = "cltest000000000000000001";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/analytics/account-health");
}

const FAKE_ACCOUNT = {
  id: "acc1",
  accountName: "My Page",
  platform: "FACEBOOK",
  isActive: true,
  audienceMetrics: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/account-health", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  // ── Rate limit ────────────────────────────────────────────────────────────

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  // ── No accounts ───────────────────────────────────────────────────────────

  it("returns empty accounts array when user has no accounts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as AccountHealthResponse;
    expect(data.accounts).toEqual([]);
    // publishResult.findMany should NOT be called when no accounts
    expect(mockResultFindMany).not.toHaveBeenCalled();
  });

  // ── postsPublished30d count ───────────────────────────────────────────────

  it("counts postsPublished30d correctly", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([FAKE_ACCOUNT]);
    mockResultFindMany.mockResolvedValueOnce([
      { accountId: "acc1", publishedAt: new Date(), insights: null },
      { accountId: "acc1", publishedAt: new Date(), insights: null },
      { accountId: "acc1", publishedAt: new Date(), insights: null },
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as AccountHealthResponse;
    expect(data.accounts[0].metrics.postsPublished30d).toBe(3);
  });

  // ── avgEngagementRate calculation ─────────────────────────────────────────

  it("calculates avgEngagementRate from insights", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([FAKE_ACCOUNT]);
    // engagement = likes+comments+shares / reach * 100
    // Post 1: (10+5+2)/100*100 = 17%
    // Post 2: (20+10+5)/200*100 = 17.5%
    // avg = 17.25%
    mockResultFindMany.mockResolvedValueOnce([
      {
        accountId: "acc1",
        publishedAt: new Date(),
        insights: { impressions: 500, reach: 100, likes: 10, comments: 5, shares: 2 },
      },
      {
        accountId: "acc1",
        publishedAt: new Date(),
        insights: { impressions: 1000, reach: 200, likes: 20, comments: 10, shares: 5 },
      },
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as AccountHealthResponse;
    expect(data.accounts[0].metrics.avgEngagementRate).toBeCloseTo(17.3, 0);
  });

  // ── followerGrowth with AudienceMetric data ───────────────────────────────

  it("computes followerGrowth30d when AudienceMetric data exists", async () => {
    const accountWithMetrics = {
      ...FAKE_ACCOUNT,
      audienceMetrics: [
        { followersCount: 1500, syncedAt: new Date() },
        { followersCount: 1200, syncedAt: new Date(Date.now() - 30 * 86400000) },
      ],
    };
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([accountWithMetrics]);
    mockResultFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as AccountHealthResponse;
    expect(data.accounts[0].metrics.followerGrowth30d).toBe(300);
  });

  // ── followerGrowth when no AudienceMetric data ────────────────────────────

  it("returns null followerGrowth30d when no audience metrics", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([FAKE_ACCOUNT]);
    mockResultFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as AccountHealthResponse;
    expect(data.accounts[0].metrics.followerGrowth30d).toBeNull();
  });

  // ── healthScore bounds ────────────────────────────────────────────────────

  it("healthScore is between 0 and 100", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([FAKE_ACCOUNT]);
    // High engagement to try to push score above 100
    const results = Array.from({ length: 20 }, () => ({
      accountId: "acc1",
      publishedAt: new Date(),
      insights: { impressions: 10000, reach: 1000, likes: 500, comments: 200, shares: 100 },
    }));
    mockResultFindMany.mockResolvedValueOnce(results);

    const res = await GET(makeRequest());
    const data = (await res.json()) as AccountHealthResponse;
    const score = data.accounts[0].healthScore;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  // ── healthLabel mapping ───────────────────────────────────────────────────

  it("assigns correct healthLabel based on score", async () => {
    // Zero posts → score likely 0 → "Needs Attention"
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([FAKE_ACCOUNT]);
    mockResultFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as AccountHealthResponse;
    expect(data.accounts[0].healthLabel).toBe("Needs Attention");
  });

  // ── Full response shape ───────────────────────────────────────────────────

  it("returns full response shape with required fields", async () => {
    const recentDate = new Date();
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([FAKE_ACCOUNT]);
    mockResultFindMany.mockResolvedValueOnce([
      {
        accountId: "acc1",
        publishedAt: recentDate,
        insights: { impressions: 200, reach: 150, likes: 10, comments: 3, shares: 1 },
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as AccountHealthResponse;

    expect(data).toHaveProperty("accounts");
    expect(Array.isArray(data.accounts)).toBe(true);

    const entry = data.accounts[0];
    expect(entry).toHaveProperty("accountId", "acc1");
    expect(entry).toHaveProperty("accountName", "My Page");
    expect(entry).toHaveProperty("platform", "FACEBOOK");
    expect(entry).toHaveProperty("isActive", true);
    expect(entry).toHaveProperty("healthScore");
    expect(entry).toHaveProperty("healthLabel");
    expect(entry).toHaveProperty("metrics");
    expect(entry.metrics).toHaveProperty("postsPublished30d");
    expect(entry.metrics).toHaveProperty("avgEngagementRate");
    expect(entry.metrics).toHaveProperty("followerGrowth30d");
    expect(entry.metrics).toHaveProperty("lastPublishedAt");
    expect(entry.metrics).toHaveProperty("daysSinceLastPost");
  });

  // ── Healthy label for active accounts ────────────────────────────────────

  it("returns Healthy label for well-performing account", async () => {
    const recentDate = new Date(); // today
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([FAKE_ACCOUNT]);
    // 14 posts in 30d (activityScore=50) + high engagement + recent post
    const results = Array.from({ length: 14 }, () => ({
      accountId: "acc1",
      publishedAt: recentDate,
      insights: { impressions: 1000, reach: 500, likes: 100, comments: 20, shares: 10 },
    }));
    mockResultFindMany.mockResolvedValueOnce(results);

    const res = await GET(makeRequest());
    const data = (await res.json()) as AccountHealthResponse;
    expect(data.accounts[0].healthLabel).toBe("Healthy");
    expect(data.accounts[0].healthScore).toBeGreaterThanOrEqual(70);
  });
});
