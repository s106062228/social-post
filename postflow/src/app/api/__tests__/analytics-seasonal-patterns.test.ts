jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
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
    post: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/seasonal-patterns/route";
import type { SeasonalPatternsResponse } from "@/app/api/analytics/seasonal-patterns/route";
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
  const url = `http://localhost:3000/api/analytics/seasonal-patterns${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function fakePost(month: number, year: number, likes = 0, comments = 0, shares = 0) {
  const publishedAt = new Date(year, month - 1, 15);
  return {
    id: `post-${Math.random().toString(36).slice(2)}`,
    content: `Content for month ${month}`,
    status: "PUBLISHED",
    updatedAt: publishedAt,
    publishResults: [
      {
        status: "PUBLISHED",
        publishedAt,
        insights: [{ likes, comments, shares }],
      },
    ],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/seasonal-patterns", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Auth ───────────────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limiting ──────────────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  // ── Input validation ───────────────────────────────────────────────────────

  it("returns 400 for invalid lookbackYears value (out of range)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await GET(makeRequest({ lookbackYears: "5" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid query parameters");
  });

  it("defaults to lookbackYears=2 when no param supplied", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as SeasonalPatternsResponse;
    expect(data.lookbackYears).toBe(2);
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it("returns 200 with empty patterns and null best/worst month when no posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as SeasonalPatternsResponse;
    expect(data.patterns).toHaveLength(0);
    expect(data.bestMonth).toBeNull();
    expect(data.worstMonth).toBeNull();
    expect(data.totalPosts).toBe(0);
  });

  // ── Patterns shape ─────────────────────────────────────────────────────────

  it("returns 12 patterns with correct shape when posts exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      fakePost(3, 2025, 10, 5, 2),
      fakePost(7, 2025, 20, 8, 3),
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as SeasonalPatternsResponse;

    expect(data.patterns).toHaveLength(12);
    expect(data.totalPosts).toBe(2);

    const pattern = data.patterns[0];
    expect(pattern).toHaveProperty("month");
    expect(pattern).toHaveProperty("monthName");
    expect(pattern).toHaveProperty("postCount");
    expect(pattern).toHaveProperty("avgEngagement");
    expect(pattern).toHaveProperty("totalEngagement");
    expect(pattern).toHaveProperty("topPosts");
    expect(Array.isArray(pattern.topPosts)).toBe(true);
  });

  // ── bestMonth / worstMonth ─────────────────────────────────────────────────

  it("correctly identifies bestMonth with highest avgEngagement", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      fakePost(1, 2025, 5, 2, 1),   // engagement = 8
      fakePost(6, 2025, 50, 20, 10), // engagement = 80
      fakePost(12, 2025, 10, 4, 2),  // engagement = 16
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as SeasonalPatternsResponse;
    expect(data.bestMonth).toBe(6);
  });

  it("returns null bestMonth when no posts provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as SeasonalPatternsResponse;
    expect(data.bestMonth).toBeNull();
    expect(data.worstMonth).toBeNull();
  });

  // ── totalPosts count ───────────────────────────────────────────────────────

  it("counts totalPosts correctly across multiple months", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      fakePost(1, 2025),
      fakePost(2, 2025),
      fakePost(3, 2025),
      fakePost(4, 2025),
      fakePost(4, 2025), // second post in April
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as SeasonalPatternsResponse;
    expect(data.totalPosts).toBe(5);
  });

  // ── Error handling ─────────────────────────────────────────────────────────

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
