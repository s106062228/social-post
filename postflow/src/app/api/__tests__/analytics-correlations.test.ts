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
import { GET } from "@/app/api/analytics/correlations/route";
import type { CorrelationsResponse } from "@/app/api/analytics/correlations/route";
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
  const url = `http://localhost:3000/api/analytics/correlations${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

/**
 * Build a fake post row for Prisma mock returns.
 * Produces a post with one publishResult that has insights.
 */
function fakePost(options: {
  content?: string;
  mediaType?: string;
  contentCategory?: string | null;
  publishedAt: Date;
  likes?: number;
  comments?: number;
  shares?: number;
}) {
  return {
    content: options.content ?? "Sample post content #hashtag",
    mediaType: options.mediaType ?? "NONE",
    contentCategory: options.contentCategory ?? null,
    publishResults: [
      {
        publishedAt: options.publishedAt,
        insights: {
          likes: options.likes ?? 5,
          comments: options.comments ?? 2,
          shares: options.shares ?? 1,
        },
      },
    ],
  };
}

/**
 * Build 12 fake posts with Tuesday (day 2 UTC) having much higher engagement.
 * Base date: 2026-04-06 (Monday). Tuesday = 2026-04-07, etc.
 */
function makeHighEngagementTuesdayPosts() {
  const posts = [];
  // 6 Tuesday posts with high engagement (total = 100 each)
  for (let i = 0; i < 6; i++) {
    const d = new Date("2026-04-07T10:00:00Z"); // Tuesday
    d.setDate(d.getDate() + i * 7);
    posts.push(
      fakePost({ publishedAt: d, likes: 50, comments: 30, shares: 20, content: "High engagement tuesday post" })
    );
  }
  // 6 Monday posts with low engagement (total = 8 each)
  for (let i = 0; i < 6; i++) {
    const d = new Date("2026-04-06T10:00:00Z"); // Monday
    d.setDate(d.getDate() + i * 7);
    posts.push(
      fakePost({ publishedAt: d, likes: 4, comments: 2, shares: 2, content: "Low engagement monday post" })
    );
  }
  return posts;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/correlations", () => {
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

  // ── Empty state ───────────────────────────────────────────────────────────

  it("returns 200 with empty insights when no published posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as CorrelationsResponse;
    expect(data.insights).toHaveLength(0);
    expect(data.totalPosts).toBe(0);
  });

  // ── Period echoed ─────────────────────────────────────────────────────────

  it("returns the requested period in the response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ period: "90d" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as CorrelationsResponse;
    expect(data.period).toBe("90d");
  });

  it("defaults to 30d when no period param", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as CorrelationsResponse;
    expect(data.period).toBe("30d");
  });

  // ── totalPosts ────────────────────────────────────────────────────────────

  it("counts totalPosts as number of publish results with insights", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    // 3 posts each with 1 publishResult
    mockFindMany.mockResolvedValueOnce([
      fakePost({ publishedAt: new Date("2026-04-07T10:00:00Z") }),
      fakePost({ publishedAt: new Date("2026-04-08T10:00:00Z") }),
      fakePost({ publishedAt: new Date("2026-04-09T10:00:00Z") }),
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as CorrelationsResponse;
    expect(data.totalPosts).toBe(3);
  });

  // ── Response shape ────────────────────────────────────────────────────────

  it("returns correct response shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as CorrelationsResponse;
    expect(data).toHaveProperty("period");
    expect(data).toHaveProperty("insights");
    expect(data).toHaveProperty("totalPosts");
    expect(Array.isArray(data.insights)).toBe(true);
  });

  // ── Insights sorted by multiplier ─────────────────────────────────────────

  it("returns insights sorted by multiplier descending", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makeHighEngagementTuesdayPosts());

    const res = await GET(makeRequest({ period: "all" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as CorrelationsResponse;

    if (data.insights.length >= 2) {
      for (let i = 1; i < data.insights.length; i++) {
        expect(data.insights[i - 1].multiplier).toBeGreaterThanOrEqual(
          data.insights[i].multiplier
        );
      }
    }
    // At minimum, a day_of_week insight for Tuesday should appear
    expect(data.insights.length).toBeGreaterThan(0);
  });

  // ── Insight shape ─────────────────────────────────────────────────────────

  it("each insight has the required shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makeHighEngagementTuesdayPosts());

    const res = await GET(makeRequest({ period: "all" }));
    const data = (await res.json()) as CorrelationsResponse;

    expect(data.insights.length).toBeGreaterThan(0);
    for (const insight of data.insights) {
      expect(insight).toHaveProperty("dimension");
      expect(insight).toHaveProperty("dimensionLabel");
      expect(insight).toHaveProperty("bestValue");
      expect(insight).toHaveProperty("bestAvgEngagement");
      expect(insight).toHaveProperty("overallAvgEngagement");
      expect(insight).toHaveProperty("multiplier");
      expect(insight).toHaveProperty("sampleSize");
      expect(insight).toHaveProperty("insight");
      expect(typeof insight.insight).toBe("string");
      expect(insight.multiplier).toBeGreaterThanOrEqual(1.2);
    }
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
