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
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
    TWITTER: "TWITTER",
    LINKEDIN: "LINKEDIN",
    PINTEREST: "PINTEREST",
    YOUTUBE: "YOUTUBE",
    TIKTOK: "TIKTOK",
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
    HASHNODE: "HASHNODE",
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
import { GET } from "@/app/api/analytics/hashtags/route";
import type { HashtagAnalyticsResponse } from "@/app/api/analytics/hashtags/route";
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
  const url = `http://localhost:3000/api/analytics/hashtags${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/hashtags", () => {
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

    const res = await GET(makeRequest({ period: "14d" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid query parameters");
  });

  it("returns 400 for invalid platform value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await GET(makeRequest({ platform: "MYSPACE" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid query parameters");
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("returns empty hashtags array when no published posts exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as HashtagAnalyticsResponse;
    expect(data.hashtags).toHaveLength(0);
    expect(data.totalPosts).toBe(0);
  });

  it("returns empty hashtags when no posts contain hashtags", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      { content: "No hashtags here", publishResults: [] },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as HashtagAnalyticsResponse;
    expect(data.hashtags).toHaveLength(0);
    expect(data.totalPosts).toBe(1);
  });

  // ── Period filter ─────────────────────────────────────────────────────────

  it("echoes the period in the response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as HashtagAnalyticsResponse;
    expect(data.period).toBe("7d");
  });

  it("uses correct date range for 7d period", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    await GET(makeRequest({ period: "7d" }));

    const callArgs = mockFindMany.mock.calls[0]?.[0] as {
      where: { updatedAt: { gte: Date } };
    };
    const since = callArgs.where.updatedAt.gte;
    const daysAgo = (Date.now() - since.getTime()) / 86_400_000;
    expect(daysAgo).toBeGreaterThan(6.9);
    expect(daysAgo).toBeLessThan(7.1);
  });

  // ── Platform filter ───────────────────────────────────────────────────────

  it("echoes platform filter in response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ platform: "FACEBOOK" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as HashtagAnalyticsResponse;
    expect(data.platform).toBe("FACEBOOK");
  });

  it("returns null platform when no platform filter provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as HashtagAnalyticsResponse;
    expect(data.platform).toBeNull();
  });

  // ── Response shape ────────────────────────────────────────────────────────

  it("returns hashtags ranked by avgEngagement with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      {
        content: "#marketing strategy #content",
        publishResults: [
          {
            insights: {
              impressions: 100,
              reach: 80,
              likes: 10,
              comments: 5,
              shares: 2,
            },
          },
        ],
      },
      {
        content: "#marketing tips",
        publishResults: [
          {
            insights: {
              impressions: 50,
              reach: 40,
              likes: 20,
              comments: 1,
              shares: 0,
            },
          },
        ],
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as HashtagAnalyticsResponse;

    expect(data.totalPosts).toBe(2);
    expect(data.hashtags.length).toBeGreaterThan(0);

    // Each hashtag should have the required fields
    const firstTag = data.hashtags[0];
    expect(firstTag).toHaveProperty("hashtag");
    expect(firstTag).toHaveProperty("postCount");
    expect(firstTag).toHaveProperty("avgEngagement");
    expect(firstTag).toHaveProperty("totalLikes");
    expect(firstTag).toHaveProperty("totalComments");
    expect(firstTag).toHaveProperty("totalShares");
    expect(firstTag).toHaveProperty("totalImpressions");
    expect(firstTag).toHaveProperty("totalReach");

    // Sorted by avgEngagement descending
    for (let i = 1; i < data.hashtags.length; i++) {
      expect(data.hashtags[i - 1]!.avgEngagement).toBeGreaterThanOrEqual(
        data.hashtags[i]!.avgEngagement
      );
    }

    // marketing appears in 2 posts
    const marketing = data.hashtags.find((h) => h.hashtag === "marketing");
    expect(marketing?.postCount).toBe(2);
  });
});
