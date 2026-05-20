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
    post: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/content-score", () => ({
  computeScore: jest.fn((insights: { likes?: number | null; comments?: number | null; shares?: number | null } | null | undefined) => {
    if (!insights) return 0;
    return (insights.likes ?? 0) * 3 + (insights.comments ?? 0) * 5 + (insights.shares ?? 0) * 4;
  }),
  scoreLabel: jest.fn().mockReturnValue("medium"),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/compare/route";
import type { CompareResponse } from "@/app/api/analytics/compare/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "cltest000000000000000001";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(postIds: string[] = []): NextRequest {
  const params = postIds.map((id) => `postId[]=${encodeURIComponent(id)}`).join("&");
  return new NextRequest(
    `http://localhost:3000/api/analytics/compare${params ? `?${params}` : ""}`
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/compare", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(makeRequest(["p1", "p2"]));
    expect(res.status).toBe(401);
  });

  // ── Rate limit ────────────────────────────────────────────────────────────

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);

    const res = await GET(makeRequest(["p1", "p2"]));
    expect(res.status).toBe(429);
  });

  // ── Validation: fewer than 2 ──────────────────────────────────────────────

  it("returns 400 when fewer than 2 postIds provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);

    const res = await GET(makeRequest(["p1"]));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/at least 2/i);
  });

  // ── Validation: more than 5 ───────────────────────────────────────────────

  it("returns 400 when more than 5 postIds provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);

    const res = await GET(makeRequest(["p1", "p2", "p3", "p4", "p5", "p6"]));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/at most 5/i);
  });

  // ── Validation: no postIds ────────────────────────────────────────────────

  it("returns 400 when no postIds provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);

    const res = await GET(makeRequest([]));
    expect(res.status).toBe(400);
  });

  // ── Ownership filter ──────────────────────────────────────────────────────

  it("returns only posts owned by user (skips foreign posts)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);

    // prisma only returns 1 post because the other belongs to a different user
    mockPostFindMany.mockResolvedValueOnce([
      {
        id: "post1",
        content: "My post",
        status: "PUBLISHED",
        publishResults: [],
      },
    ]);

    const res = await GET(makeRequest(["post1", "foreignPost"]));
    expect(res.status).toBe(200);
    const data = (await res.json()) as CompareResponse;
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].id).toBe("post1");
  });

  // ── Comparison data shape ─────────────────────────────────────────────────

  it("returns 200 with comparison data shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);

    mockPostFindMany.mockResolvedValueOnce([
      {
        id: "post1",
        content: "Hello world",
        status: "PUBLISHED",
        publishResults: [
          {
            platform: "FACEBOOK",
            insights: { impressions: 100, reach: 80, likes: 10, comments: 2, shares: 5 },
          },
        ],
      },
      {
        id: "post2",
        content: "Another post",
        status: "PUBLISHED",
        publishResults: [],
      },
    ]);

    const res = await GET(makeRequest(["post1", "post2"]));
    expect(res.status).toBe(200);

    const data = (await res.json()) as CompareResponse;
    expect(data).toHaveProperty("posts");
    expect(data).toHaveProperty("winnerId");
    expect(Array.isArray(data.posts)).toBe(true);
    expect(data.posts).toHaveLength(2);

    const post1 = data.posts.find((p) => p.id === "post1")!;
    expect(post1).toHaveProperty("id", "post1");
    expect(post1).toHaveProperty("content", "Hello world");
    expect(post1).toHaveProperty("status", "PUBLISHED");
    expect(post1).toHaveProperty("platforms");
    expect(post1).toHaveProperty("totalScore");
    expect(post1).toHaveProperty("totalImpressions");
    expect(post1).toHaveProperty("totalReach");
    expect(post1).toHaveProperty("totalLikes");
    expect(post1).toHaveProperty("totalComments");
    expect(post1).toHaveProperty("totalShares");
  });

  // ── Winner detection ──────────────────────────────────────────────────────

  it("computes winnerId as post with highest totalScore", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);

    mockPostFindMany.mockResolvedValueOnce([
      {
        id: "post1",
        content: "Hello world",
        status: "PUBLISHED",
        publishResults: [
          {
            platform: "FACEBOOK",
            insights: { impressions: 100, reach: 80, likes: 10, comments: 2, shares: 5 },
          },
        ],
      },
      {
        id: "post2",
        content: "Another post",
        status: "PUBLISHED",
        publishResults: [],
      },
    ]);

    const res = await GET(makeRequest(["post1", "post2"]));
    const data = (await res.json()) as CompareResponse;

    // post1 has insights → score > 0; post2 has no insights → score = 0
    expect(data.winnerId).toBe("post1");
  });

  // ── Winner null when all scores zero ──────────────────────────────────────

  it("returns winnerId null when all scores are zero", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);

    mockPostFindMany.mockResolvedValueOnce([
      {
        id: "post1",
        content: "No insights post 1",
        status: "PUBLISHED",
        publishResults: [],
      },
      {
        id: "post2",
        content: "No insights post 2",
        status: "PUBLISHED",
        publishResults: [],
      },
    ]);

    const res = await GET(makeRequest(["post1", "post2"]));
    const data = (await res.json()) as CompareResponse;

    expect(data.winnerId).toBeNull();
  });

  // ── Per-platform breakdown ────────────────────────────────────────────────

  it("returns per-platform breakdown", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);

    mockPostFindMany.mockResolvedValueOnce([
      {
        id: "post1",
        content: "Multi-platform post",
        status: "PUBLISHED",
        publishResults: [
          {
            platform: "FACEBOOK",
            insights: { impressions: 200, reach: 150, likes: 20, comments: 5, shares: 3 },
          },
          {
            platform: "INSTAGRAM",
            insights: { impressions: 300, reach: 250, likes: 50, comments: 10, shares: 8 },
          },
        ],
      },
      {
        id: "post2",
        content: "Single platform post",
        status: "PUBLISHED",
        publishResults: [
          {
            platform: "FACEBOOK",
            insights: { impressions: 100, reach: 80, likes: 5, comments: 1, shares: 1 },
          },
        ],
      },
    ]);

    const res = await GET(makeRequest(["post1", "post2"]));
    const data = (await res.json()) as CompareResponse;

    const post1 = data.posts.find((p) => p.id === "post1")!;
    expect(post1.platforms).toHaveLength(2);

    const fbPlatform = post1.platforms.find((p) => p.platform === "FACEBOOK")!;
    expect(fbPlatform).toHaveProperty("platform", "FACEBOOK");
    expect(fbPlatform).toHaveProperty("impressions", 200);
    expect(fbPlatform).toHaveProperty("reach", 150);
    expect(fbPlatform).toHaveProperty("likes", 20);
    expect(fbPlatform).toHaveProperty("comments", 5);
    expect(fbPlatform).toHaveProperty("shares", 3);
    expect(fbPlatform).toHaveProperty("score");
    expect(typeof fbPlatform.score).toBe("number");

    const igPlatform = post1.platforms.find((p) => p.platform === "INSTAGRAM")!;
    expect(igPlatform).toHaveProperty("platform", "INSTAGRAM");

    // Totals should sum platform values
    expect(post1.totalImpressions).toBe(500);
    expect(post1.totalReach).toBe(400);
    expect(post1.totalLikes).toBe(70);
    expect(post1.totalComments).toBe(15);
    expect(post1.totalShares).toBe(11);
  });
});
