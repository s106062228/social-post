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
    publishResult: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/publishing-streak/route";
import type { PublishingStreakResponse } from "@/app/api/analytics/publishing-streak/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.publishResult.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/analytics/publishing-streak");
}

/** Returns a publishedAt Date that is N days ago at noon UTC */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/publishing-streak", () => {
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

  // ── Empty state ───────────────────────────────────────────────────────────

  it("returns all zeros with empty last30Days when no posts published", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PublishingStreakResponse;

    expect(data.currentStreak).toBe(0);
    expect(data.longestStreak).toBe(0);
    expect(data.totalActiveDays).toBe(0);
    expect(data.streakStartDate).toBeNull();
    expect(data.last30Days.every((d) => d.count === 0)).toBe(true);
  });

  // ── currentStreak ─────────────────────────────────────────────────────────

  it("counts consecutive days correctly for currentStreak", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    // Published 3 consecutive days: today, yesterday, 2 days ago
    mockFindMany.mockResolvedValueOnce([
      { publishedAt: daysAgo(0) },
      { publishedAt: daysAgo(1) },
      { publishedAt: daysAgo(2) },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PublishingStreakResponse;

    expect(data.currentStreak).toBe(3);
  });

  // ── longestStreak ─────────────────────────────────────────────────────────

  it("tracks best streak across history correctly", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    // A run of 5 days two weeks ago (days 14–10) followed by a gap,
    // then only 1 day today → longestStreak should be 5
    mockFindMany.mockResolvedValueOnce([
      { publishedAt: daysAgo(14) },
      { publishedAt: daysAgo(13) },
      { publishedAt: daysAgo(12) },
      { publishedAt: daysAgo(11) },
      { publishedAt: daysAgo(10) },
      // gap of 9 days
      { publishedAt: daysAgo(0) },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PublishingStreakResponse;

    expect(data.longestStreak).toBeGreaterThanOrEqual(5);
    expect(data.currentStreak).toBe(1);
  });

  // ── last30Days ────────────────────────────────────────────────────────────

  it("last30Days has exactly 30 entries", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PublishingStreakResponse;

    expect(data.last30Days).toHaveLength(30);
  });

  it("last30Days entries have correct shape {date, count}", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([{ publishedAt: daysAgo(0) }]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PublishingStreakResponse;

    for (const entry of data.last30Days) {
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("count");
      expect(typeof entry.date).toBe("string");
      expect(typeof entry.count).toBe("number");
      // date should be YYYY-MM-DD format
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // ── streakStartDate ───────────────────────────────────────────────────────

  it("streakStartDate is null when currentStreak is 0", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    // Published only 5 days ago (no recent streak)
    mockFindMany.mockResolvedValueOnce([
      { publishedAt: daysAgo(5) },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PublishingStreakResponse;

    expect(data.currentStreak).toBe(0);
    expect(data.streakStartDate).toBeNull();
  });

  // ── streakLabel ───────────────────────────────────────────────────────────

  it("streakLabel shows correct count when streak is active", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    mockFindMany.mockResolvedValueOnce([
      { publishedAt: daysAgo(0) },
      { publishedAt: daysAgo(1) },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PublishingStreakResponse;

    expect(data.streakLabel).toBe(`🔥 ${data.currentStreak}-day streak`);
    expect(data.currentStreak).toBeGreaterThan(0);
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
