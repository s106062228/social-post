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
import { GET } from "@/app/api/analytics/summary/route";
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

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/analytics/summary");
}

function setupDefaultMocks(overrides: {
  total?: number;
  published?: number;
  failed?: number;
  scheduled?: number;
  draft?: number;
  publishing?: number;
  partial?: number;
  publishResults?: Array<{ platform: string; status: string }>;
  recentPosts?: Array<{ createdAt: Date }>;
} = {}) {
  const {
    total = 10,
    published = 6,
    failed = 2,
    scheduled = 1,
    draft = 1,
    publishing = 0,
    partial = 0,
    publishResults = [
      { platform: "FACEBOOK", status: "PUBLISHED" },
      { platform: "FACEBOOK", status: "PUBLISHED" },
      { platform: "INSTAGRAM", status: "FAILED" },
    ],
    recentPosts = [
      { createdAt: new Date("2026-04-20T10:00:00Z") },
      { createdAt: new Date("2026-04-20T12:00:00Z") },
      { createdAt: new Date("2026-04-21T09:00:00Z") },
    ],
  } = overrides;

  // count is called 7 times in order: total, published, failed, scheduled, draft, publishing, partial
  mockPostCount
    .mockResolvedValueOnce(total)
    .mockResolvedValueOnce(published)
    .mockResolvedValueOnce(failed)
    .mockResolvedValueOnce(scheduled)
    .mockResolvedValueOnce(draft)
    .mockResolvedValueOnce(publishing)
    .mockResolvedValueOnce(partial);

  mockPublishResultFindMany.mockResolvedValueOnce(publishResults);
  mockPostFindMany.mockResolvedValueOnce(recentPosts);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/summary", () => {
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

  // ── Successful response ───────────────────────────────────────────────────

  it("returns 200 with correct post status counts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks();

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      posts: {
        total: number;
        draft: number;
        scheduled: number;
        publishing: number;
        published: number;
        partiallyPublished: number;
        failed: number;
      };
    };
    expect(data.posts.total).toBe(10);
    expect(data.posts.published).toBe(6);
    expect(data.posts.failed).toBe(2);
    expect(data.posts.scheduled).toBe(1);
    expect(data.posts.draft).toBe(1);
    expect(data.posts.publishing).toBe(0);
    expect(data.posts.partiallyPublished).toBe(0);
  });

  it("returns correct overall publish result statistics", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks({
      publishResults: [
        { platform: "FACEBOOK", status: "PUBLISHED" },
        { platform: "FACEBOOK", status: "PUBLISHED" },
        { platform: "INSTAGRAM", status: "FAILED" },
        { platform: "THREADS", status: "PUBLISHED" },
      ],
    });

    const res = await GET(makeRequest());
    const data = (await res.json()) as {
      publishResults: { total: number; published: number; failed: number; overallSuccessRate: number };
    };

    expect(data.publishResults.total).toBe(4);
    expect(data.publishResults.published).toBe(3);
    expect(data.publishResults.failed).toBe(1);
    expect(data.publishResults.overallSuccessRate).toBe(75);
  });

  it("returns 0% success rate when no publish results exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks({ publishResults: [], recentPosts: [] });

    const res = await GET(makeRequest());
    const data = (await res.json()) as {
      publishResults: { total: number; overallSuccessRate: number };
    };

    expect(data.publishResults.total).toBe(0);
    expect(data.publishResults.overallSuccessRate).toBe(0);
  });

  it("returns platform breakdown with correct per-platform counts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks({
      publishResults: [
        { platform: "FACEBOOK", status: "PUBLISHED" },
        { platform: "FACEBOOK", status: "PUBLISHED" },
        { platform: "FACEBOOK", status: "FAILED" },
        { platform: "INSTAGRAM", status: "PUBLISHED" },
        { platform: "INSTAGRAM", status: "PENDING" },
      ],
    });

    const res = await GET(makeRequest());
    const data = (await res.json()) as {
      platforms: Array<{
        platform: string;
        published: number;
        failed: number;
        pending: number;
        total: number;
        successRate: number;
      }>;
    };

    const fb = data.platforms.find((p) => p.platform === "FACEBOOK")!;
    expect(fb.published).toBe(2);
    expect(fb.failed).toBe(1);
    expect(fb.total).toBe(3);
    expect(fb.successRate).toBe(67);

    const ig = data.platforms.find((p) => p.platform === "INSTAGRAM")!;
    expect(ig.published).toBe(1);
    expect(ig.pending).toBe(1);
    expect(ig.total).toBe(2);
    expect(ig.successRate).toBe(50);

    const th = data.platforms.find((p) => p.platform === "THREADS")!;
    expect(th.total).toBe(0);
    expect(th.successRate).toBe(0);
  });

  it("aggregates daily activity correctly", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks({
      recentPosts: [
        { createdAt: new Date("2026-04-20T10:00:00Z") },
        { createdAt: new Date("2026-04-20T15:00:00Z") },
        { createdAt: new Date("2026-04-21T09:00:00Z") },
      ],
    });

    const res = await GET(makeRequest());
    const data = (await res.json()) as {
      dailyActivity: Array<{ date: string; count: number }>;
    };

    const apr20 = data.dailyActivity.find((d) => d.date === "2026-04-20");
    const apr21 = data.dailyActivity.find((d) => d.date === "2026-04-21");

    expect(apr20?.count).toBe(2);
    expect(apr21?.count).toBe(1);
  });

  it("returns empty dailyActivity array when no recent posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    setupDefaultMocks({ recentPosts: [] });

    const res = await GET(makeRequest());
    const data = (await res.json()) as { dailyActivity: unknown[] };
    expect(Array.isArray(data.dailyActivity)).toBe(true);
    expect(data.dailyActivity).toHaveLength(0);
  });

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
