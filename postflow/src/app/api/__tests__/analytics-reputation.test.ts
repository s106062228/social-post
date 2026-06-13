jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
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
    socialComment: { findMany: jest.fn(), count: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/reputation/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.socialComment.findMany as jest.Mock;
const mockCount = prisma.socialComment.count as jest.Mock;

const MOCK_USER_ID = "cltest000000000000000001";
const AUTHED = { user: { id: MOCK_USER_ID } };
const RL_OK = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

function makeRequest(params = ""): NextRequest {
  return new NextRequest(`http://localhost/api/analytics/reputation${params ? `?${params}` : ""}`);
}

function makeComment(sentiment: string, daysAgo: number) {
  return {
    postedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    sentiment,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);
  mockFindMany.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
});

describe("GET /api/analytics/reputation", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    const res = await GET(makeRequest("period=1year"));
    expect(res.status).toBe(400);
  });

  it("returns empty state when no analyzed comments", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reputationScore).toBe(0);
    expect(body.analyzedCount).toBe(0);
    expect(body.distribution.total).toBe(0);
    expect(body.dailyBreakdown).toHaveLength(30);
  });

  it("reputationScore clamps between 0 and 100", async () => {
    mockFindMany.mockResolvedValue([makeComment("POSITIVE", 5), makeComment("POSITIVE", 3)]);
    mockCount.mockResolvedValue(2);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.reputationScore).toBeGreaterThanOrEqual(0);
    expect(body.reputationScore).toBeLessThanOrEqual(100);
  });

  it("returns correct distribution shape", async () => {
    mockFindMany.mockResolvedValue([
      makeComment("POSITIVE", 1),
      makeComment("NEUTRAL", 2),
      makeComment("NEGATIVE", 3),
    ]);
    mockCount.mockResolvedValue(5);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.distribution.positive).toBe(1);
    expect(body.distribution.neutral).toBe(1);
    expect(body.distribution.negative).toBe(1);
    expect(body.distribution.total).toBe(3);
  });

  it("returns improving trend when sentiment improves", async () => {
    // More positives recently (days 1-2) vs early (days 25-28)
    const comments = [
      ...Array(5).fill(null).map((_, i) => makeComment("POSITIVE", i + 1)),
      ...Array(5).fill(null).map(() => makeComment("NEGATIVE", 26)),
    ];
    mockFindMany.mockResolvedValue(comments);
    mockCount.mockResolvedValue(10);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(["improving", "stable", "declining"]).toContain(body.trend);
  });

  it("returns declining trend when negatives increase", async () => {
    const comments = [
      makeComment("POSITIVE", 28),
      makeComment("POSITIVE", 27),
      makeComment("POSITIVE", 26),
      makeComment("NEGATIVE", 2),
      makeComment("NEGATIVE", 1),
    ];
    mockFindMany.mockResolvedValue(comments);
    mockCount.mockResolvedValue(5);
    const res = await GET(makeRequest("period=30d"));
    const body = await res.json();
    expect(["improving", "stable", "declining"]).toContain(body.trend);
  });

  it("dailyBreakdown always has 30 entries", async () => {
    const res = await GET(makeRequest("period=90d"));
    const body = await res.json();
    expect(body.dailyBreakdown).toHaveLength(30);
  });

  it("returns analyzedCount vs totalCount", async () => {
    mockFindMany.mockResolvedValue([makeComment("POSITIVE", 1)]);
    mockCount.mockResolvedValue(10);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.analyzedCount).toBe(1);
    expect(body.totalCount).toBe(10);
  });

  it("returns period in response", async () => {
    const res = await GET(makeRequest("period=7d"));
    const body = await res.json();
    expect(body.period).toBe("7d");
  });

  it("returns 500 on DB error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
