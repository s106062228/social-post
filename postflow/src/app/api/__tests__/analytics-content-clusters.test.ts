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
import { GET } from "@/app/api/analytics/content-clusters/route";
import type { ContentClustersResponse } from "@/app/api/analytics/content-clusters/route";
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
  const url = `http://localhost:3000/api/analytics/content-clusters${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function fakePost(content: string, likes = 0, comments = 0, shares = 0) {
  return {
    id: `post-${Math.random().toString(36).slice(2)}`,
    content,
    publishResults: [
      {
        status: "PUBLISHED",
        insights: { likes, comments, shares },
      },
    ],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/content-clusters", () => {
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

  it("returns 400 for invalid period value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid query parameters");
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it("returns 200 with empty clusters when no published posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentClustersResponse;
    expect(data.clusters).toHaveLength(0);
    expect(data.totalPosts).toBe(0);
    expect(data.uncategorizedCount).toBe(0);
  });

  // ── Period echoed ──────────────────────────────────────────────────────────

  it("returns the requested period in the response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ period: "90d" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentClustersResponse;
    expect(data.period).toBe("90d");
  });

  it("defaults to 30d when no period param", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentClustersResponse;
    expect(data.period).toBe("30d");
  });

  // ── Clustering result ──────────────────────────────────────────────────────

  it("groups posts sharing a dominant keyword and returns cluster shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      fakePost("marketing strategy digital growth", 10, 5, 2),
      fakePost("marketing tips for social media engagement", 20, 8, 3),
      fakePost("marketing brand awareness campaign", 15, 6, 1),
    ]);

    const res = await GET(makeRequest({ period: "all" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentClustersResponse;

    expect(data.totalPosts).toBe(3);
    if (data.clusters.length > 0) {
      const cluster = data.clusters[0];
      expect(cluster).toHaveProperty("topic");
      expect(cluster).toHaveProperty("postCount");
      expect(cluster).toHaveProperty("postIds");
      expect(cluster).toHaveProperty("avgEngagement");
      expect(cluster).toHaveProperty("totalEngagement");
      expect(cluster).toHaveProperty("coverage");
      expect(cluster).toHaveProperty("relatedKeywords");
      expect(typeof cluster.topic).toBe("string");
      expect(typeof cluster.coverage).toBe("number");
      expect(cluster.coverage).toBeGreaterThanOrEqual(0);
      expect(cluster.coverage).toBeLessThanOrEqual(100);
      expect(Array.isArray(cluster.postIds)).toBe(true);
      expect(Array.isArray(cluster.relatedKeywords)).toBe(true);
    }
  });

  // ── maxClusters param ──────────────────────────────────────────────────────

  it("respects maxClusters param to limit returned clusters", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const posts = [];
    for (let i = 0; i < 10; i++) {
      posts.push(fakePost(`topic${i} keyword${i} content${i} subject${i}`));
      posts.push(fakePost(`topic${i} another${i} post${i} writing${i}`));
    }
    mockFindMany.mockResolvedValueOnce(posts);

    const res = await GET(makeRequest({ period: "all", maxClusters: "2" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentClustersResponse;
    expect(data.clusters.length).toBeLessThanOrEqual(2);
  });

  // ── Response shape ─────────────────────────────────────────────────────────

  it("returns correct top-level response shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as ContentClustersResponse;
    expect(data).toHaveProperty("period");
    expect(data).toHaveProperty("clusters");
    expect(data).toHaveProperty("totalPosts");
    expect(data).toHaveProperty("uncategorizedCount");
    expect(Array.isArray(data.clusters)).toBe(true);
  });

  // ── uncategorizedCount ─────────────────────────────────────────────────────

  it("totalPosts and uncategorizedCount are consistent", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      fakePost("marketing strategy"),
      fakePost("marketing brand growth"),
      fakePost("xyz abc def ghi"),
    ]);

    const res = await GET(makeRequest({ period: "all" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentClustersResponse;

    expect(data.totalPosts).toBe(3);
    const clusteredCount = data.clusters.reduce((s, c) => s + c.postCount, 0);
    expect(clusteredCount + data.uncategorizedCount).toBe(data.totalPosts);
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
