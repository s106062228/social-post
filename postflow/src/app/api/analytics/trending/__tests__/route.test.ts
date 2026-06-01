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
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findMany: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/trending/route";
import type { TrendingHashtagsResponse } from "@/app/api/analytics/trending/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "cltest000000000000000001";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/analytics/trending");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const NOW = new Date("2026-06-01T12:00:00Z");
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function makeDbPost(content: string, publishedAt: Date, likes = 0) {
  return {
    content,
    publishResults: [
      {
        publishedAt,
        insights: { likes, comments: 0, shares: 0, reach: 100, impressions: 0 },
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Fix date to make tests deterministic
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("GET /api/analytics/trending", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RL_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RL_OK);
    const res = await GET(makeRequest({ period: "999d" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with empty hashtags when no posts", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as TrendingHashtagsResponse;
    expect(body.hashtags).toHaveLength(0);
    expect(body.totalPosts).toBe(0);
    expect(body.period).toBe("30d");
  });

  it("returns correct period in response", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest({ period: "60d" }));
    const body = (await res.json()) as TrendingHashtagsResponse;
    expect(body.period).toBe("60d");
  });

  it("returns trending hashtags with correct shape", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([
      makeDbPost("#trending topic", daysAgo(1), 50),
      makeDbPost("#trending old content", daysAgo(12), 5),
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as TrendingHashtagsResponse;
    expect(body.hashtags.length).toBeGreaterThan(0);

    const hashtag = body.hashtags[0]!;
    expect(hashtag).toHaveProperty("hashtag");
    expect(hashtag).toHaveProperty("velocityScore");
    expect(hashtag).toHaveProperty("trend");
    expect(hashtag).toHaveProperty("recentEngagement");
    expect(hashtag).toHaveProperty("baselineEngagement");
    expect(hashtag).toHaveProperty("recentPostCount");
    expect(hashtag).toHaveProperty("baselinePostCount");
  });

  it("identifies a rising hashtag correctly", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([
      makeDbPost("#growth tips", daysAgo(1), 100),
      makeDbPost("#growth boost", daysAgo(2), 90),
      makeDbPost("#growth old", daysAgo(10), 5),
      makeDbPost("#growth lower", daysAgo(15), 4),
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as TrendingHashtagsResponse;
    const growth = body.hashtags.find((h) => h.hashtag === "growth");
    expect(growth).toBeDefined();
    expect(growth!.trend).toBe("rising");
  });

  it("totalPosts reflects number of DB posts", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RL_OK);
    const dbPosts = [
      makeDbPost("#tag1", daysAgo(1)),
      makeDbPost("#tag2", daysAgo(2)),
      makeDbPost("no hashtags here", daysAgo(3)),
    ];
    mockFindMany.mockResolvedValue(dbPosts);

    const res = await GET(makeRequest());
    const body = (await res.json()) as TrendingHashtagsResponse;
    expect(body.totalPosts).toBe(3);
  });

  it("skips publishResult with null publishedAt", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([
      {
        content: "#skipped",
        publishResults: [{ publishedAt: null, insights: null }],
      },
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as TrendingHashtagsResponse;
    expect(body.hashtags.find((h) => h.hashtag === "skipped")).toBeUndefined();
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockRejectedValue(new Error("DB error"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
