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
import { GET } from "@/app/api/analytics/posting-frequency/route";
import type { PostingFrequencyResponse } from "@/app/api/analytics/posting-frequency/route";
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

function makeResult(platform: string) {
  return { platform };
}

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/posting-frequency${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/posting-frequency", () => {
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
    const res = await GET(makeRequest({ period: "all" }));
    expect(res.status).toBe(400);
  });

  it("defaults to 30d when no period param", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PostingFrequencyResponse;
    expect(data.period).toBe("30d");
  });

  it("returns empty platforms and score 0 when no published posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PostingFrequencyResponse;

    expect(data.platforms).toHaveLength(0);
    expect(data.totalPublished).toBe(0);
    expect(data.overallPacingScore).toBe(0);
  });

  it("returns correct shape for the response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([makeResult("FACEBOOK"), makeResult("FACEBOOK")]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as PostingFrequencyResponse;

    expect(data).toHaveProperty("period");
    expect(data).toHaveProperty("platforms");
    expect(data).toHaveProperty("overallPacingScore");
    expect(data).toHaveProperty("totalPublished");
    expect(Array.isArray(data.platforms)).toBe(true);
  });

  it("returns per-platform data with correct fields", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([
      makeResult("FACEBOOK"),
      makeResult("INSTAGRAM"),
      makeResult("INSTAGRAM"),
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as PostingFrequencyResponse;

    expect(data.platforms.length).toBeGreaterThan(0);
    for (const p of data.platforms) {
      expect(p).toHaveProperty("platform");
      expect(p).toHaveProperty("actualPerWeek");
      expect(p).toHaveProperty("recommendedPerWeek");
      expect(p).toHaveProperty("pacingScore");
      expect(p).toHaveProperty("status");
      expect(p).toHaveProperty("totalPublished");
      expect(["optimal", "over", "under"]).toContain(p.status);
      expect(p.pacingScore).toBeGreaterThanOrEqual(0);
      expect(p.pacingScore).toBeLessThanOrEqual(100);
    }
    expect(data.totalPublished).toBe(3);
  });

  it("computes overallPacingScore as average of platform scores", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    // Exactly 7 posts in 7 days on INSTAGRAM (recommended: 7/wk) → score 100
    const results = Array.from({ length: 7 }, () => makeResult("INSTAGRAM"));
    mockFindMany.mockResolvedValueOnce(results);

    const res = await GET(makeRequest({ period: "7d" }));
    const data = (await res.json()) as PostingFrequencyResponse;

    // With 7/wk actual vs 7/wk recommended → optimal, score = 100
    expect(data.overallPacingScore).toBe(100);
    expect(data.platforms[0].status).toBe("optimal");
  });

  it("returns 500 on DB error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB connection failed"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
