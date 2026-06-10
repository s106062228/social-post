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
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) { super(msg); this.code = opts.code; }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
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
import { GET } from "@/app/api/analytics/profile-optimizer/route";
import type { ProfileOptimizerResponse } from "@/app/api/analytics/profile-optimizer/route";
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
  return new NextRequest("http://localhost/api/analytics/profile-optimizer");
}

const MOCK_ACCOUNT = {
  id: "acc1",
  accountName: "Test Page",
  platform: "FACEBOOK",
  isActive: true,
  audienceMetrics: [
    { followersCount: 1000, syncedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    { followersCount: 1050, syncedAt: new Date() },
  ],
};

const MOCK_PUBLISH_RESULT = {
  accountId: "acc1",
  publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  insights: { likes: 10, comments: 5, shares: 2, reach: 500 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);
  mockAccountFindMany.mockResolvedValue([]);
  mockPublishFindMany.mockResolvedValue([]);
});

describe("GET /api/analytics/profile-optimizer", () => {
  test("401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  test("429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  test("returns empty accounts and null fleetScore when no accounts", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ProfileOptimizerResponse;
    expect(body.accounts).toHaveLength(0);
    expect(body.fleetScore).toBeNull();
  });

  test("returns account with score and grade", async () => {
    mockAccountFindMany.mockResolvedValue([MOCK_ACCOUNT]);
    mockPublishFindMany.mockResolvedValue([MOCK_PUBLISH_RESULT]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ProfileOptimizerResponse;
    expect(body.accounts).toHaveLength(1);
    const acc = body.accounts[0];
    expect(acc.accountId).toBe("acc1");
    expect(acc.platform).toBe("FACEBOOK");
    expect(acc.score.overallScore).toBeGreaterThanOrEqual(0);
    expect(acc.score.overallScore).toBeLessThanOrEqual(100);
    expect(["A", "B", "C", "D", "F"]).toContain(acc.score.grade);
  });

  test("returns 4 dimensions in score", async () => {
    mockAccountFindMany.mockResolvedValue([MOCK_ACCOUNT]);
    mockPublishFindMany.mockResolvedValue([MOCK_PUBLISH_RESULT]);
    const res = await GET(makeRequest());
    const body = (await res.json()) as ProfileOptimizerResponse;
    const dims = body.accounts[0].score.dimensions;
    expect(dims).toHaveLength(4);
    const names = dims.map((d) => d.name);
    expect(names).toContain("Activity");
    expect(names).toContain("Engagement");
    expect(names).toContain("Growth");
    expect(names).toContain("Consistency");
  });

  test("computes fleetScore as average of all account scores", async () => {
    const acc2 = { ...MOCK_ACCOUNT, id: "acc2", accountName: "Second" };
    mockAccountFindMany.mockResolvedValue([MOCK_ACCOUNT, acc2]);
    mockPublishFindMany.mockResolvedValue([
      MOCK_PUBLISH_RESULT,
      { ...MOCK_PUBLISH_RESULT, accountId: "acc2" },
    ]);
    const res = await GET(makeRequest());
    const body = (await res.json()) as ProfileOptimizerResponse;
    expect(body.accounts).toHaveLength(2);
    const expectedFleet = Math.round(
      (body.accounts[0].score.overallScore + body.accounts[1].score.overallScore) / 2
    );
    expect(body.fleetScore).toBe(expectedFleet);
  });

  test("handles account with no publish results (low score)", async () => {
    mockAccountFindMany.mockResolvedValue([MOCK_ACCOUNT]);
    mockPublishFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    const body = (await res.json()) as ProfileOptimizerResponse;
    const score = body.accounts[0].score.overallScore;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(60); // low score due to no activity/engagement
  });

  test("tips array is present and priority-sorted (high before low)", async () => {
    mockAccountFindMany.mockResolvedValue([MOCK_ACCOUNT]);
    mockPublishFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    const body = (await res.json()) as ProfileOptimizerResponse;
    const tips = body.accounts[0].score.tips;
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < tips.length; i++) {
      expect(priorityOrder[tips[i].priority]).toBeGreaterThanOrEqual(
        priorityOrder[tips[i - 1].priority]
      );
    }
  });

  test("dimension scores sum to at most 100", async () => {
    mockAccountFindMany.mockResolvedValue([MOCK_ACCOUNT]);
    mockPublishFindMany.mockResolvedValue([MOCK_PUBLISH_RESULT]);
    const res = await GET(makeRequest());
    const body = (await res.json()) as ProfileOptimizerResponse;
    const dims = body.accounts[0].score.dimensions;
    const sum = dims.reduce((s, d) => s + d.score, 0);
    expect(sum).toBeLessThanOrEqual(100);
  });

  test("500 on unexpected DB error", async () => {
    mockAccountFindMany.mockRejectedValue(new Error("DB crashed"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
