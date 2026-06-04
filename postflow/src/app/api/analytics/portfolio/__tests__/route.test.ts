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
import { GET } from "@/app/api/analytics/portfolio/route";
import type { PortfolioResponse } from "@/app/api/analytics/portfolio/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockAccountFindMany = prisma.socialAccount.findMany as jest.Mock;
const mockPublishFindMany = prisma.publishResult.findMany as jest.Mock;

const MOCK_USER_ID = "cltest000000000000000001";
const AUTHED = { user: { id: MOCK_USER_ID } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/analytics/portfolio");
}

const NOW = new Date();
const RECENT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago (within 7 days)
const WEEK_AGO = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000); // 9 days ago (outside 7 days)

const ACCOUNT_FB = {
  id: "acc-fb",
  accountName: "My Facebook Page",
  platform: "FACEBOOK",
  isActive: true,
  audienceMetrics: [
    { followersCount: 1200, syncedAt: RECENT },
    { followersCount: 1100, syncedAt: WEEK_AGO },
  ],
};

const ACCOUNT_IG = {
  id: "acc-ig",
  accountName: "My Instagram",
  platform: "INSTAGRAM",
  isActive: true,
  audienceMetrics: [
    { followersCount: 800, syncedAt: RECENT },
  ],
};

const ACCOUNT_INACTIVE = {
  id: "acc-x",
  accountName: "Old Twitter",
  platform: "TWITTER",
  isActive: false,
  audienceMetrics: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/portfolio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns empty portfolio when no accounts", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockAccountFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body: PortfolioResponse = await res.json();
    expect(body.totalAccounts).toBe(0);
    expect(body.accounts).toHaveLength(0);
    expect(body.topPlatformByFollowers).toBeNull();
  });

  it("returns correct account count and active count", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockAccountFindMany.mockResolvedValue([ACCOUNT_FB, ACCOUNT_IG, ACCOUNT_INACTIVE]);
    mockPublishFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body: PortfolioResponse = await res.json();
    expect(body.totalAccounts).toBe(3);
    expect(body.activeAccounts).toBe(2);
  });

  it("aggregates follower counts across accounts", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockAccountFindMany.mockResolvedValue([ACCOUNT_FB, ACCOUNT_IG]);
    mockPublishFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body: PortfolioResponse = await res.json();
    expect(body.totalFollowers).toBe(2000); // 1200 + 800
  });

  it("computes totalPublished30d across all accounts", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockAccountFindMany.mockResolvedValue([ACCOUNT_FB, ACCOUNT_IG]);
    mockPublishFindMany.mockResolvedValue([
      { accountId: "acc-fb", insights: null },
      { accountId: "acc-fb", insights: null },
      { accountId: "acc-ig", insights: null },
    ]);

    const res = await GET(makeRequest());
    const body: PortfolioResponse = await res.json();
    expect(body.totalPublished30d).toBe(3);
  });

  it("computes totalEngagement30d summing likes+comments+shares", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockAccountFindMany.mockResolvedValue([ACCOUNT_FB]);
    mockPublishFindMany.mockResolvedValue([
      {
        accountId: "acc-fb",
        insights: { reach: 1000, likes: 50, comments: 10, shares: 5 },
      },
    ]);

    const res = await GET(makeRequest());
    const body: PortfolioResponse = await res.json();
    expect(body.totalEngagement30d).toBe(65); // 50+10+5
  });

  it("sets topPlatformByFollowers to account with most followers", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockAccountFindMany.mockResolvedValue([ACCOUNT_IG, ACCOUNT_FB]); // FB has 1200 > IG 800
    mockPublishFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body: PortfolioResponse = await res.json();
    expect(body.topPlatformByFollowers).toBe("FACEBOOK");
  });

  it("sets topPlatformByEngagement to account with most total engagement", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockAccountFindMany.mockResolvedValue([ACCOUNT_FB, ACCOUNT_IG]);
    mockPublishFindMany.mockResolvedValue([
      {
        accountId: "acc-ig",
        insights: { reach: 500, likes: 200, comments: 50, shares: 30 },
      },
      {
        accountId: "acc-fb",
        insights: { reach: 2000, likes: 10, comments: 2, shares: 1 },
      },
    ]);

    const res = await GET(makeRequest());
    const body: PortfolioResponse = await res.json();
    expect(body.topPlatformByEngagement).toBe("INSTAGRAM"); // 280 > 13
  });

  it("response shape has all required fields", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockAccountFindMany.mockResolvedValue([ACCOUNT_FB]);
    mockPublishFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body: PortfolioResponse = await res.json();
    expect(body).toHaveProperty("totalAccounts");
    expect(body).toHaveProperty("activeAccounts");
    expect(body).toHaveProperty("totalFollowers");
    expect(body).toHaveProperty("totalFollowerGrowth7d");
    expect(body).toHaveProperty("totalPublished30d");
    expect(body).toHaveProperty("totalEngagement30d");
    expect(body).toHaveProperty("overallEngagementRate");
    expect(body).toHaveProperty("topPlatformByFollowers");
    expect(body).toHaveProperty("topPlatformByEngagement");
    expect(body).toHaveProperty("accounts");
  });

  it("per-account entry shape has all required fields", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockAccountFindMany.mockResolvedValue([ACCOUNT_FB]);
    mockPublishFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body: PortfolioResponse = await res.json();
    const acc = body.accounts[0];
    expect(acc).toHaveProperty("accountId");
    expect(acc).toHaveProperty("accountName");
    expect(acc).toHaveProperty("platform");
    expect(acc).toHaveProperty("isActive");
    expect(acc).toHaveProperty("followers");
    expect(acc).toHaveProperty("followerGrowth7d");
    expect(acc).toHaveProperty("postsPublished30d");
    expect(acc).toHaveProperty("totalEngagement30d");
    expect(acc).toHaveProperty("avgEngagementRate");
  });
});
