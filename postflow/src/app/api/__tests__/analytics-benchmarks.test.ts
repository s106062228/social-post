jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
    TWITTER: "TWITTER",
    LINKEDIN: "LINKEDIN",
    TIKTOK: "TIKTOK",
    YOUTUBE: "YOUTUBE",
    PINTEREST: "PINTEREST",
    BLUESKY: "BLUESKY",
    MASTODON: "MASTODON",
    TELEGRAM: "TELEGRAM",
    REDDIT: "REDDIT",
    NOSTR: "NOSTR",
    TUMBLR: "TUMBLR",
    WORDPRESS: "WORDPRESS",
    MEDIUM: "MEDIUM",
    GHOST: "GHOST",
    DEVTO: "DEVTO",
    GOOGLE_BUSINESS: "GOOGLE_BUSINESS",
    HASHNODE: "HASHNODE",
  },
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
import { GET } from "@/app/api/analytics/benchmarks/route";
import type { BenchmarksResponse } from "@/app/api/analytics/benchmarks/route";
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
  const url = `http://localhost:3000/api/analytics/benchmarks${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

// 4 posts with insights for FACEBOOK — enough to get a non-"insufficient" comparison
function makeFacebookRows(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    platform: "FACEBOOK",
    insights: {
      impressions: 1000 + i * 100,
      reach: 800 + i * 80,
      likes: 30 + i * 5,
      comments: 5 + i,
      shares: 2 + i,
    },
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/benchmarks", () => {
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

    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid query parameters");
  });

  it("returns 400 for invalid platform value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await GET(makeRequest({ platform: "MYSPACE" }));
    expect(res.status).toBe(400);
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("returns empty comparisons when no published results exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as BenchmarksResponse;
    expect(data.comparisons).toHaveLength(0);
    expect(data.period).toBe("90d");
    expect(Array.isArray(data.benchmarkedPlatforms)).toBe(true);
    expect(data.benchmarkedPlatforms.length).toBeGreaterThan(0);
  });

  // ── Response shape ────────────────────────────────────────────────────────

  it("returns correct comparison shape for a platform with enough data", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makeFacebookRows(4));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as BenchmarksResponse;
    expect(data.comparisons.length).toBeGreaterThan(0);

    const fb = data.comparisons.find((c) => c.platform === "FACEBOOK");
    expect(fb).toBeDefined();
    expect(fb!.userMetrics).toMatchObject({
      postCount: 4,
    });
    expect(typeof fb!.userMetrics.avgEngagementRate).toBe("number");
    expect(fb!.benchmark).toBeDefined();
    expect(fb!.benchmark!.engagementRate).toBe(0.64);
    expect(["above", "at", "below"]).toContain(fb!.performance);
    expect(typeof fb!.diffPct).toBe("number");
  });

  it("marks comparison as insufficient when postCount < 3", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makeFacebookRows(2));

    const res = await GET(makeRequest());
    const data = (await res.json()) as BenchmarksResponse;
    const fb = data.comparisons.find((c) => c.platform === "FACEBOOK");
    expect(fb).toBeDefined();
    expect(fb!.performance).toBe("insufficient");
    expect(fb!.diffPct).toBeNull();
  });

  // ── Period handling ───────────────────────────────────────────────────────

  it("echoes the period in the response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ period: "30d" }));
    const data = (await res.json()) as BenchmarksResponse;
    expect(data.period).toBe("30d");
  });

  it("accepts 'all' as period and returns 200", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ period: "all" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as BenchmarksResponse;
    expect(data.period).toBe("all");
  });

  // ── Platform filter ───────────────────────────────────────────────────────

  it("passes platform filter to Prisma and returns only that platform", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makeFacebookRows(5));

    const res = await GET(makeRequest({ platform: "FACEBOOK" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as BenchmarksResponse;
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ platform: "FACEBOOK" }),
      })
    );
    expect(data.comparisons.every((c) => c.platform === "FACEBOOK")).toBe(true);
  });

  // ── Performance classification ────────────────────────────────────────────

  it("classifies above-average performance correctly", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    // FB benchmark is 0.64%; generate data with ~5% engagement rate
    mockFindMany.mockResolvedValueOnce(
      Array.from({ length: 5 }, () => ({
        platform: "FACEBOOK",
        insights: { impressions: 1000, reach: 1000, likes: 50, comments: 0, shares: 0 }, // 5% rate
      }))
    );

    const res = await GET(makeRequest());
    const data = (await res.json()) as BenchmarksResponse;
    const fb = data.comparisons.find((c) => c.platform === "FACEBOOK");
    expect(fb!.performance).toBe("above");
    expect(fb!.diffPct).toBeGreaterThan(0);
  });

  it("classifies below-average performance correctly", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    // FB benchmark is 0.64%; generate data with ~0.01% engagement rate
    mockFindMany.mockResolvedValueOnce(
      Array.from({ length: 5 }, () => ({
        platform: "FACEBOOK",
        insights: { impressions: 10000, reach: 10000, likes: 1, comments: 0, shares: 0 },
      }))
    );

    const res = await GET(makeRequest());
    const data = (await res.json()) as BenchmarksResponse;
    const fb = data.comparisons.find((c) => c.platform === "FACEBOOK");
    expect(fb!.performance).toBe("below");
    expect(fb!.diffPct).toBeLessThan(0);
  });

  // ── Multi-platform ────────────────────────────────────────────────────────

  it("handles multiple platforms in one response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const rows = [
      ...makeFacebookRows(4),
      ...Array.from({ length: 4 }, () => ({
        platform: "INSTAGRAM",
        insights: { impressions: 500, reach: 400, likes: 20, comments: 3, shares: 1 },
      })),
    ];
    mockFindMany.mockResolvedValueOnce(rows);

    const res = await GET(makeRequest());
    const data = (await res.json()) as BenchmarksResponse;
    const platforms = data.comparisons.map((c) => c.platform);
    expect(platforms).toContain("FACEBOOK");
    expect(platforms).toContain("INSTAGRAM");
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
