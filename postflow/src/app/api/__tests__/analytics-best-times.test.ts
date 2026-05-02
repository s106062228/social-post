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
    publishResult: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/best-times/route";
import type { BestTimesResponse } from "@/app/api/analytics/best-times/route";
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

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/best-times${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

// Published results with varying publishedAt hours and engagement
function makeFakeResults() {
  return [
    {
      platform: "FACEBOOK",
      publishedAt: new Date("2026-04-20T10:00:00Z"), // Monday 10am UTC
      insights: { impressions: 1000, reach: 800, likes: 50, comments: 10, shares: 5 },
    },
    {
      platform: "FACEBOOK",
      publishedAt: new Date("2026-04-21T10:00:00Z"), // Tuesday 10am UTC
      insights: { impressions: 1200, reach: 900, likes: 60, comments: 15, shares: 8 },
    },
    {
      platform: "INSTAGRAM",
      publishedAt: new Date("2026-04-20T14:00:00Z"), // Monday 2pm UTC
      insights: { impressions: 500, reach: 400, likes: 30, comments: 5, shares: 2 },
    },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/best-times", () => {
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

  it("returns 400 for invalid platform value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await GET(makeRequest({ platform: "TIKTOK" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid query parameters");
  });

  it("returns 400 for invalid period value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid query parameters");
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("returns empty=true when no published results with insights exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as BestTimesResponse;
    expect(data.empty).toBe(true);
    expect(data.slots).toHaveLength(0);
    expect(data.platform).toBe("ALL");
  });

  // ── Platform filter ───────────────────────────────────────────────────────

  it("passes platform filter to Prisma query and echoes it in response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(
      makeFakeResults().filter((r) => r.platform === "FACEBOOK")
    );

    const res = await GET(makeRequest({ platform: "FACEBOOK" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as BestTimesResponse;
    expect(data.platform).toBe("FACEBOOK");
    // Prisma should have been called with platform filter
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ platform: "FACEBOOK" }),
      })
    );
  });

  // ── Aggregation shape ─────────────────────────────────────────────────────

  it("returns aggregated slots with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makeFakeResults());

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as BestTimesResponse;

    expect(data.empty).toBe(false);
    expect(Array.isArray(data.slots)).toBe(true);
    expect(data.slots.length).toBeGreaterThan(0);

    for (const slot of data.slots) {
      expect(slot).toHaveProperty("hour");
      expect(slot).toHaveProperty("dayOfWeek");
      expect(slot).toHaveProperty("avgEngagement");
      expect(slot).toHaveProperty("sampleSize");
      expect(slot.hour).toBeGreaterThanOrEqual(0);
      expect(slot.hour).toBeLessThan(24);
      expect(slot.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(slot.dayOfWeek).toBeLessThan(7);
      expect(slot.sampleSize).toBeGreaterThan(0);
      expect(slot.avgEngagement).toBeGreaterThanOrEqual(0);
    }
  });

  it("sorts slots by avgEngagement descending", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makeFakeResults());

    const res = await GET(makeRequest());
    const data = (await res.json()) as BestTimesResponse;

    for (let i = 1; i < data.slots.length; i++) {
      expect(data.slots[i - 1].avgEngagement).toBeGreaterThanOrEqual(
        data.slots[i].avgEngagement
      );
    }
  });

  it("merges two posts at the same hour+day into one slot with sampleSize 2", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    // Both at Monday 10am UTC
    mockFindMany.mockResolvedValueOnce([
      {
        platform: "FACEBOOK",
        publishedAt: new Date("2026-04-20T10:00:00Z"),
        insights: { impressions: 100, reach: 80, likes: 10, comments: 2, shares: 1 },
      },
      {
        platform: "FACEBOOK",
        publishedAt: new Date("2026-04-27T10:00:00Z"), // also Monday 10am
        insights: { impressions: 200, reach: 160, likes: 20, comments: 4, shares: 2 },
      },
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as BestTimesResponse;

    const slot = data.slots.find((s) => s.hour === 10);
    expect(slot).toBeDefined();
    expect(slot!.sampleSize).toBe(2);
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
