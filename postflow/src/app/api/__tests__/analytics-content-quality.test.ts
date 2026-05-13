jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
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
    post: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/content-quality/route";
import type { ContentQualityResponse } from "@/app/api/analytics/content-quality/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/content-quality${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function makePosts(overrides: Array<{ content?: string; sentiment?: string | null }> = []) {
  const defaults = [
    { content: "Hello world this is a great post!", sentiment: "POSITIVE" },
    { content: "Neutral content about things and stuff.", sentiment: "NEUTRAL" },
    { content: "Terrible experience today.", sentiment: "NEGATIVE" },
    { content: "Amazing product! Highly recommend.", sentiment: "POSITIVE" },
    { content: "Just a plain update.", sentiment: null },
  ];
  return overrides.length > 0 ? overrides : defaults;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/content-quality", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("returns 400 for invalid period value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await GET(makeRequest({ period: "180d" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid query parameters");
  });

  // ── Empty result ──────────────────────────────────────────────────────────

  it("returns zeroed response when no posts exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentQualityResponse;

    expect(data.totalPosts).toBe(0);
    expect(data.sentiment.POSITIVE).toBe(0);
    expect(data.sentiment.NEUTRAL).toBe(0);
    expect(data.sentiment.NEGATIVE).toBe(0);
    expect(data.sentiment.unanalyzed).toBe(0);
    expect(data.wordCount.avg).toBe(0);
    expect(data.wordCount.median).toBe(0);
    expect(data.wordCount.min).toBe(0);
    expect(data.wordCount.max).toBe(0);
  });

  // ── Period handling ───────────────────────────────────────────────────────

  it("defaults to 30d when no period supplied", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentQualityResponse;
    expect(data.period).toBe("30d");
  });

  it("accepts 7d period", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentQualityResponse;
    expect(data.period).toBe("7d");
  });

  it("accepts 90d period", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ period: "90d" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentQualityResponse;
    expect(data.period).toBe("90d");
  });

  // ── Sentiment shape ───────────────────────────────────────────────────────

  it("returns correct sentiment distribution with mixed posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makePosts());

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentQualityResponse;

    expect(data.sentiment.POSITIVE).toBe(2);
    expect(data.sentiment.NEUTRAL).toBe(1);
    expect(data.sentiment.NEGATIVE).toBe(1);
    expect(data.sentiment.unanalyzed).toBe(1);
    expect(data.sentiment.positivePercent).toBe(50); // 2/4 analyzed
    expect(data.sentiment.neutralPercent).toBe(25);
    expect(data.sentiment.negativePercent).toBe(25);
    expect(data.totalPosts).toBe(5);
  });

  // ── Readability shape ─────────────────────────────────────────────────────

  it("returns readability distribution with correct keys", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makePosts());

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentQualityResponse;

    expect(data.readability).toHaveProperty("very-easy");
    expect(data.readability).toHaveProperty("easy");
    expect(data.readability).toHaveProperty("medium");
    expect(data.readability).toHaveProperty("hard");
    expect(data.readability).toHaveProperty("very-hard");

    const total = Object.values(data.readability).reduce((s, n) => s + n, 0);
    expect(total).toBe(5); // all posts classified
  });

  // ── Word count stats ──────────────────────────────────────────────────────

  it("returns non-zero word count stats with posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makePosts());

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentQualityResponse;

    expect(data.wordCount.avg).toBeGreaterThan(0);
    expect(data.wordCount.median).toBeGreaterThan(0);
    expect(data.wordCount.min).toBeGreaterThan(0);
    expect(data.wordCount.max).toBeGreaterThanOrEqual(data.wordCount.min);
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 on unexpected DB error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB down"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Internal server error");
  });
});
