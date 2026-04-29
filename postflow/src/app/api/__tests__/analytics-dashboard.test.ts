jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
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
    post: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    publishResult: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/dashboard/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostCount = prisma.post.count as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockPublishResultFindMany = prisma.publishResult.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(period?: string): NextRequest {
  const url = period
    ? `http://localhost:3000/api/analytics/dashboard?period=${period}`
    : "http://localhost:3000/api/analytics/dashboard";
  return new NextRequest(url);
}

function setupDefaultMocks(overrides: {
  total?: number;
  published?: number;
  failed?: number;
  scheduled?: number;
  draft?: number;
  recentPosts?: Array<{ createdAt: Date; status: string }>;
  publishResults?: Array<{ platform: string; status: string; publishedAt: Date | null }>;
} = {}) {
  const {
    total = 10,
    published = 6,
    failed = 2,
    scheduled = 1,
    draft = 1,
    recentPosts = [
      { createdAt: new Date("2026-04-20T10:00:00Z"), status: "PUBLISHED" },
      { createdAt: new Date("2026-04-21T09:00:00Z"), status: "DRAFT" },
    ],
    publishResults = [
      { platform: "FACEBOOK", status: "PUBLISHED", publishedAt: new Date("2026-04-20T10:00:00Z") },
      { platform: "INSTAGRAM", status: "FAILED", publishedAt: null },
    ],
  } = overrides;

  // count called 5 times: total, published, failed, scheduled, draft
  mockPostCount
    .mockResolvedValueOnce(total)
    .mockResolvedValueOnce(published)
    .mockResolvedValueOnce(failed)
    .mockResolvedValueOnce(scheduled)
    .mockResolvedValueOnce(draft);

  mockPostFindMany.mockResolvedValueOnce(recentPosts);
  mockPublishResultFindMany.mockResolvedValueOnce(publishResults);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/dashboard", () => {
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

  // ── Period validation ─────────────────────────────────────────────────────

  it("returns 400 for invalid period value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await GET(makeRequest("invalid"));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid period");
  });

  it("defaults to 30d when period param is absent", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks();

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { period: string };
    expect(data.period).toBe("30d");
  });

  // ── KPI shape ─────────────────────────────────────────────────────────────

  it("returns correct KPI counts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks({ total: 20, published: 12, failed: 3, scheduled: 2, draft: 3 });

    const res = await GET(makeRequest("30d"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      kpis: { total: number; published: number; failed: number; scheduled: number; draft: number; successRate: number };
    };
    expect(data.kpis.total).toBe(20);
    expect(data.kpis.published).toBe(12);
    expect(data.kpis.failed).toBe(3);
    expect(data.kpis.scheduled).toBe(2);
    expect(data.kpis.draft).toBe(3);
  });

  it("returns 0 successRate when no publish results in period", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks({ publishResults: [] });

    const res = await GET(makeRequest());
    const data = (await res.json()) as { kpis: { successRate: number } };
    expect(data.kpis.successRate).toBe(0);
  });

  // ── Time series ───────────────────────────────────────────────────────────

  it("returns timeSeries array with one entry per day", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks();

    const res = await GET(makeRequest("7d"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      timeSeries: Array<{ date: string; created: number; published: number; failed: number }>;
    };
    expect(Array.isArray(data.timeSeries)).toBe(true);
    expect(data.timeSeries).toHaveLength(7);
    for (const entry of data.timeSeries) {
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("created");
      expect(entry).toHaveProperty("published");
      expect(entry).toHaveProperty("failed");
    }
  });

  // ── Platform distribution ─────────────────────────────────────────────────

  it("returns platformDist with all three platforms", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks({
      publishResults: [
        { platform: "FACEBOOK", status: "PUBLISHED", publishedAt: new Date() },
        { platform: "FACEBOOK", status: "PUBLISHED", publishedAt: new Date() },
        { platform: "INSTAGRAM", status: "FAILED", publishedAt: null },
      ],
    });

    const res = await GET(makeRequest());
    const data = (await res.json()) as {
      platformDist: Array<{ platform: string; published: number; failed: number; total: number }>;
    };
    expect(data.platformDist).toHaveLength(3);
    const fb = data.platformDist.find((p) => p.platform === "FACEBOOK")!;
    expect(fb.published).toBe(2);
    expect(fb.total).toBe(2);
    const ig = data.platformDist.find((p) => p.platform === "INSTAGRAM")!;
    expect(ig.failed).toBe(1);
  });

  // ── Hourly activity ───────────────────────────────────────────────────────

  it("returns hourlyActivity with 24 entries", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks();

    const res = await GET(makeRequest());
    const data = (await res.json()) as {
      hourlyActivity: Array<{ hour: number; count: number }>;
    };
    expect(data.hourlyActivity).toHaveLength(24);
    for (const entry of data.hourlyActivity) {
      expect(entry.hour).toBeGreaterThanOrEqual(0);
      expect(entry.hour).toBeLessThan(24);
    }
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 on unexpected DB error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostCount.mockRejectedValueOnce(new Error("DB down"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Internal server error");
  });
});
