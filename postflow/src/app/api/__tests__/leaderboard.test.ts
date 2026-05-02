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
    publishResult: { findMany: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/leaderboard/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPublishResultFindMany = prisma.publishResult.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED = { user: { id: MOCK_USER_ID, email: "u@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeReq(params?: Record<string, string>): NextRequest {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return new NextRequest(`http://localhost/api/analytics/leaderboard${qs}`);
}

const POST_A = {
  id: "post_a_id",
  content: "Hello world post A",
  mediaType: "NONE",
  status: "PUBLISHED",
  scheduledAt: null,
  createdAt: new Date("2026-04-01T10:00:00Z"),
};

const POST_B = {
  id: "post_b_id",
  content: "Hello world post B",
  mediaType: "IMAGE",
  status: "PUBLISHED",
  scheduledAt: null,
  createdAt: new Date("2026-04-02T10:00:00Z"),
};

function makeResults() {
  return [
    {
      postId: "post_a_id",
      platform: "FACEBOOK",
      publishedUrl: "https://fb.com/1",
      publishedAt: new Date("2026-04-01T10:00:00Z"),
      insights: { impressions: 1000, reach: 800, likes: 50, comments: 20, shares: 15 },
      post: POST_A,
    },
    {
      postId: "post_a_id",
      platform: "INSTAGRAM",
      publishedUrl: "https://ig.com/1",
      publishedAt: new Date("2026-04-01T10:00:00Z"),
      insights: { impressions: 500, reach: 400, likes: 30, comments: 10, shares: 5 },
      post: POST_A,
    },
    {
      postId: "post_b_id",
      platform: "THREADS",
      publishedUrl: "https://threads.net/1",
      publishedAt: new Date("2026-04-02T10:00:00Z"),
      insights: { impressions: 200, reach: 150, likes: 5, comments: 2, shares: 1 },
      post: POST_B,
    },
  ];
}

describe("GET /api/analytics/leaderboard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await GET(makeReq({ period: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns empty ranked array when no insights data", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPublishResultFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { ranked: unknown[] };
    expect(body.ranked).toHaveLength(0);
  });

  it("returns ranked posts with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPublishResultFindMany.mockResolvedValueOnce(makeResults());
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as {
      period: string;
      limit: number;
      ranked: Array<{
        rank: number;
        postId: string;
        contentPreview: string;
        totalScore: number;
        totals: { impressions: number; reach: number; likes: number; comments: number; shares: number };
        platforms: Array<{ platform: string; score: number }>;
      }>;
    };
    expect(body.period).toBe("30d");
    expect(body.limit).toBe(20);
    expect(body.ranked.length).toBeGreaterThan(0);
    const first = body.ranked[0];
    expect(first).toHaveProperty("rank", 1);
    expect(first).toHaveProperty("postId");
    expect(first).toHaveProperty("contentPreview");
    expect(first).toHaveProperty("totalScore");
    expect(first).toHaveProperty("totals");
    expect(first.totals).toHaveProperty("impressions");
    expect(first).toHaveProperty("platforms");
    expect(Array.isArray(first.platforms)).toBe(true);
  });

  it("ranks posts by descending total score", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPublishResultFindMany.mockResolvedValueOnce(makeResults());
    const res = await GET(makeReq());
    const body = await res.json() as { ranked: Array<{ postId: string; totalScore: number }> };
    // post_a has two platform results summed, post_b has one — post_a should rank #1
    expect(body.ranked[0].postId).toBe("post_a_id");
    expect(body.ranked[0].totalScore).toBeGreaterThan(body.ranked[1].totalScore);
  });

  it("aggregates totals across platforms for a single post", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPublishResultFindMany.mockResolvedValueOnce(makeResults());
    const res = await GET(makeReq());
    const body = await res.json() as { ranked: Array<{ postId: string; totals: { impressions: number } }> };
    const postA = body.ranked.find((r) => r.postId === "post_a_id");
    expect(postA).toBeDefined();
    // impressions: 1000 + 500 = 1500
    expect(postA!.totals.impressions).toBe(1500);
  });

  it("respects the period filter", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPublishResultFindMany.mockResolvedValueOnce([]);
    await GET(makeReq({ period: "7d" }));
    const call = mockPublishResultFindMany.mock.calls[0][0] as { where: { publishedAt?: unknown } };
    expect(call.where).toHaveProperty("publishedAt");
  });

  it("omits period filter for 'all'", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPublishResultFindMany.mockResolvedValueOnce([]);
    await GET(makeReq({ period: "all" }));
    const call = mockPublishResultFindMany.mock.calls[0][0] as { where: { publishedAt?: unknown } };
    expect(call.where.publishedAt).toBeUndefined();
  });

  it("respects custom limit parameter", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPublishResultFindMany.mockResolvedValueOnce(makeResults());
    const res = await GET(makeReq({ limit: "1" }));
    const body = await res.json() as { ranked: unknown[] };
    expect(body.ranked.length).toBe(1);
  });

  it("truncates contentPreview to 120 chars", async () => {
    const longContent = "A".repeat(200);
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPublishResultFindMany.mockResolvedValueOnce([
      {
        postId: "post_long",
        platform: "FACEBOOK",
        publishedUrl: null,
        publishedAt: new Date(),
        insights: { impressions: 100, reach: 50, likes: 5, comments: 1, shares: 1 },
        post: { id: "post_long", content: longContent, mediaType: "NONE", status: "PUBLISHED", scheduledAt: null, createdAt: new Date() },
      },
    ]);
    const res = await GET(makeReq());
    const body = await res.json() as { ranked: Array<{ contentPreview: string }> };
    expect(body.ranked[0].contentPreview.length).toBe(120);
  });
});
