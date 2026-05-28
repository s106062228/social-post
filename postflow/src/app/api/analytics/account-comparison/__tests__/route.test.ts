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
import { GET } from "@/app/api/analytics/account-comparison/route";
import type { AccountComparisonResponse } from "@/app/api/analytics/account-comparison/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockAccountFindMany = prisma.socialAccount.findMany as jest.Mock;
const mockPublishFindMany = prisma.publishResult.findMany as jest.Mock;

const MOCK_USER_ID = "cltest000000000000000001";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const ACC_A = {
  id: "acc-a",
  accountName: "My Facebook",
  platform: "FACEBOOK",
  audienceMetrics: [],
};
const ACC_B = {
  id: "acc-b",
  accountName: "My Instagram",
  platform: "INSTAGRAM",
  audienceMetrics: [],
};

function makeRequest(accountIds: string[]): NextRequest {
  const qs = accountIds.map((id) => `accountIds[]=${id}`).join("&");
  return new NextRequest(
    `http://localhost:3000/api/analytics/account-comparison?${qs}`
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/account-comparison", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(["acc-a", "acc-b"]));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);
    const res = await GET(makeRequest(["acc-a", "acc-b"]));
    expect(res.status).toBe(429);
  });

  it("returns 400 when fewer than 2 accountIds provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await GET(makeRequest(["acc-a"]));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least 2/i);
  });

  it("returns 400 when more than 4 accountIds provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await GET(makeRequest(["a1", "a2", "a3", "a4", "a5"]));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/maximum 4/i);
  });

  it("returns 400 when non-owned accounts resolve to fewer than 2", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    // Only one account returned (the other doesn't belong to user)
    mockAccountFindMany.mockResolvedValueOnce([ACC_A]);
    // publishResult.findMany is NOT called — route returns 400 before reaching it
    const res = await GET(makeRequest(["acc-a", "acc-other"]));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not enough valid accounts/i);
  });

  it("returns comparison data with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([ACC_A, ACC_B]);
    mockPublishFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeRequest(["acc-a", "acc-b"]));
    expect(res.status).toBe(200);
    const body: AccountComparisonResponse = await res.json();
    expect(body.accounts).toHaveLength(2);
    expect(body.comparedAt).toBeDefined();
    const first = body.accounts[0];
    expect(first).toHaveProperty("accountId");
    expect(first).toHaveProperty("accountName");
    expect(first).toHaveProperty("platform");
    expect(first.metrics).toHaveProperty("publishedCount30d");
    expect(first.metrics).toHaveProperty("avgEngagement");
    expect(first.metrics).toHaveProperty("engagementRate");
    expect(first.metrics).toHaveProperty("followerGrowth30d");
    expect(first.metrics).toHaveProperty("postsPerWeek");
    expect(first.metrics).toHaveProperty("topPostId");
  });

  it("computes engagementRate correctly", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([ACC_A, ACC_B]);
    mockPublishFindMany.mockResolvedValueOnce([
      {
        accountId: "acc-a",
        postId: "post-1",
        insights: { impressions: 1000, reach: 500, likes: 10, comments: 5, shares: 2 },
      },
    ]);
    const res = await GET(makeRequest(["acc-a", "acc-b"]));
    expect(res.status).toBe(200);
    const body: AccountComparisonResponse = await res.json();
    const accA = body.accounts.find((a) => a.accountId === "acc-a")!;
    // engagement = 10+5+2 = 17, reach = 500 → rate = 17/500*100 = 3.4
    expect(accA.metrics.engagementRate).toBeCloseTo(3.4, 1);
  });

  it("returns followerGrowth30d when audienceMetrics available", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([
      {
        ...ACC_A,
        audienceMetrics: [
          { followersCount: 1200, syncedAt: new Date() },
          { followersCount: 1000, syncedAt: new Date(Date.now() - 30 * 86400000) },
        ],
      },
      ACC_B,
    ]);
    mockPublishFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeRequest(["acc-a", "acc-b"]));
    expect(res.status).toBe(200);
    const body: AccountComparisonResponse = await res.json();
    const accA = body.accounts.find((a) => a.accountId === "acc-a")!;
    expect(accA.metrics.followerGrowth30d).toBe(200);
  });

  it("returns null followerGrowth30d when no audienceMetrics", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([ACC_A, ACC_B]);
    mockPublishFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeRequest(["acc-a", "acc-b"]));
    expect(res.status).toBe(200);
    const body: AccountComparisonResponse = await res.json();
    body.accounts.forEach((acc) => {
      expect(acc.metrics.followerGrowth30d).toBeNull();
    });
  });

  it("computes postsPerWeek correctly", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([ACC_A, ACC_B]);
    // acc-a has 8 published posts in 30 days
    mockPublishFindMany.mockResolvedValueOnce(
      Array.from({ length: 8 }, (_, i) => ({
        accountId: "acc-a",
        postId: `post-${i}`,
        insights: null,
      }))
    );
    const res = await GET(makeRequest(["acc-a", "acc-b"]));
    expect(res.status).toBe(200);
    const body: AccountComparisonResponse = await res.json();
    const accA = body.accounts.find((a) => a.accountId === "acc-a")!;
    // 8 / 4.29 ≈ 1.9
    expect(accA.metrics.postsPerWeek).toBeCloseTo(1.9, 0);
    expect(accA.metrics.publishedCount30d).toBe(8);
  });

  it("sets topPostId to the post with highest engagement", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([ACC_A, ACC_B]);
    mockPublishFindMany.mockResolvedValueOnce([
      {
        accountId: "acc-a",
        postId: "low-post",
        insights: { impressions: 100, reach: 50, likes: 1, comments: 0, shares: 0 },
      },
      {
        accountId: "acc-a",
        postId: "high-post",
        insights: { impressions: 5000, reach: 3000, likes: 100, comments: 50, shares: 20 },
      },
    ]);
    const res = await GET(makeRequest(["acc-a", "acc-b"]));
    expect(res.status).toBe(200);
    const body: AccountComparisonResponse = await res.json();
    const accA = body.accounts.find((a) => a.accountId === "acc-a")!;
    expect(accA.metrics.topPostId).toBe("high-post");
  });

  it("returns empty metrics when no publish results", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockAccountFindMany.mockResolvedValueOnce([ACC_A, ACC_B]);
    mockPublishFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeRequest(["acc-a", "acc-b"]));
    expect(res.status).toBe(200);
    const body: AccountComparisonResponse = await res.json();
    body.accounts.forEach((acc) => {
      expect(acc.metrics.publishedCount30d).toBe(0);
      expect(acc.metrics.avgEngagement).toBe(0);
      expect(acc.metrics.engagementRate).toBe(0);
      expect(acc.metrics.topPostId).toBeNull();
    });
  });
});
