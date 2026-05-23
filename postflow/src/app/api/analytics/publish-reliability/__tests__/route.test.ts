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
import { GET } from "@/app/api/analytics/publish-reliability/route";
import type { PublishReliabilityResponse } from "@/app/api/analytics/publish-reliability/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.publishResult.findMany as jest.Mock;

const MOCK_USER_ID = "cltest000000000000000001";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeResult(
  platform: string,
  status: "PUBLISHED" | "FAILED",
  opts: {
    error?: string;
    retryCount?: number;
    publishedAt?: Date;
    scheduledAt?: Date;
  } = {}
) {
  return {
    platform,
    status,
    error: opts.error ?? null,
    publishedAt: opts.publishedAt ?? (status === "PUBLISHED" ? new Date() : null),
    retryCount: opts.retryCount ?? 0,
    post: { scheduledAt: opts.scheduledAt ?? null },
  };
}

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/publish-reliability${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/publish-reliability", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await GET(makeRequest({ period: "365d" }));
    expect(res.status).toBe(400);
  });

  it("defaults to 30d when no period param", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PublishReliabilityResponse;
    expect(data.period).toBe("30d");
  });

  it("returns correct shape with empty results", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PublishReliabilityResponse;

    expect(data).toHaveProperty("period");
    expect(data).toHaveProperty("platforms");
    expect(data).toHaveProperty("overallSuccessRate");
    expect(data).toHaveProperty("totalPublished");
    expect(data).toHaveProperty("totalFailed");
    expect(Array.isArray(data.platforms)).toBe(true);
    expect(data.platforms).toHaveLength(0);
    expect(data.overallSuccessRate).toBe(0);
    expect(data.totalPublished).toBe(0);
    expect(data.totalFailed).toBe(0);
  });

  it("computes overall success rate correctly", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    // 3 published, 1 failed → 75%
    mockFindMany.mockResolvedValueOnce([
      makeResult("FACEBOOK", "PUBLISHED"),
      makeResult("FACEBOOK", "PUBLISHED"),
      makeResult("FACEBOOK", "PUBLISHED"),
      makeResult("FACEBOOK", "FAILED"),
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as PublishReliabilityResponse;
    expect(data.overallSuccessRate).toBe(75);
    expect(data.totalPublished).toBe(3);
    expect(data.totalFailed).toBe(1);
  });

  it("returns per-platform breakdown shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([
      makeResult("FACEBOOK", "PUBLISHED"),
      makeResult("INSTAGRAM", "FAILED", { error: "Token expired" }),
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as PublishReliabilityResponse;

    expect(data.platforms).toHaveLength(2);
    for (const p of data.platforms) {
      expect(p).toHaveProperty("platform");
      expect(p).toHaveProperty("successRate");
      expect(p).toHaveProperty("totalAttempts");
      expect(p).toHaveProperty("successCount");
      expect(p).toHaveProperty("failedCount");
      expect(p).toHaveProperty("avgRetryCount");
      expect(p).toHaveProperty("commonErrors");
      expect(p).toHaveProperty("avgPublishLatencyMs");
      expect(typeof p.successRate).toBe("number");
      expect(Array.isArray(p.commonErrors)).toBe(true);
    }
  });

  it("captures common error messages", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([
      makeResult("FACEBOOK", "FAILED", { error: "Token expired" }),
      makeResult("FACEBOOK", "FAILED", { error: "Token expired" }),
      makeResult("FACEBOOK", "FAILED", { error: "Rate limit hit" }),
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as PublishReliabilityResponse;
    const fb = data.platforms.find((p) => p.platform === "FACEBOOK");

    expect(fb).toBeDefined();
    expect(fb!.commonErrors[0]).toBe("Token expired");
    expect(fb!.commonErrors).toHaveLength(2);
  });

  it("computes avg publish latency when scheduledAt is present", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const scheduledAt = new Date("2026-07-01T10:00:00Z");
    const publishedAt = new Date("2026-07-01T10:05:00Z"); // 5 minutes later
    mockFindMany.mockResolvedValueOnce([
      makeResult("INSTAGRAM", "PUBLISHED", { publishedAt, scheduledAt }),
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as PublishReliabilityResponse;
    const ig = data.platforms.find((p) => p.platform === "INSTAGRAM");

    expect(ig).toBeDefined();
    expect(ig!.avgPublishLatencyMs).toBe(5 * 60 * 1000); // 300000 ms
  });

  it("sorts platforms by total attempts descending", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([
      makeResult("THREADS", "PUBLISHED"),
      makeResult("FACEBOOK", "PUBLISHED"),
      makeResult("FACEBOOK", "PUBLISHED"),
      makeResult("FACEBOOK", "FAILED"),
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as PublishReliabilityResponse;

    // FACEBOOK has 3 attempts, THREADS has 1 → FACEBOOK first
    expect(data.platforms[0].platform).toBe("FACEBOOK");
    expect(data.platforms[1].platform).toBe("THREADS");
  });

  it("returns 500 on unexpected DB error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
