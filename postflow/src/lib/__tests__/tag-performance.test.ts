import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    postTag: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err: unknown) => {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { GET } from "@/app/api/analytics/tag-performance/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockRl = apiLimiter as jest.MockedFunction<typeof apiLimiter>;

const rlAllow = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const rlDeny = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

function makeReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/analytics/tag-performance");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function makePostTag(tagId: string, tagName: string, tagColor: string, postId: string, insights: object | null = null) {
  return {
    postId,
    tagId,
    tag: { id: tagId, name: tagName, color: tagColor },
    post: {
      id: postId,
      publishResults: insights
        ? [{ insights }]
        : [],
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as never);
  mockRl.mockResolvedValue(rlAllow);
  (prisma.postTag.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/analytics/tag-performance", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockRl.mockResolvedValue(rlDeny);
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    const res = await GET(makeReq({ period: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns empty state when no tagged posts", async () => {
    const res = await GET(makeReq({ period: "30d" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { tags: unknown[]; totalTaggedPosts: number };
    expect(body.tags).toEqual([]);
    expect(body.totalTaggedPosts).toBe(0);
  });

  it("echoes the period in the response", async () => {
    const res = await GET(makeReq({ period: "7d" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { period: string };
    expect(body.period).toBe("7d");
  });

  it("defaults to 30d when no period param given", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { period: string };
    expect(body.period).toBe("30d");
  });

  it("returns tags sorted by avgEngagement descending", async () => {
    (prisma.postTag.findMany as jest.Mock).mockResolvedValue([
      makePostTag("t1", "marketing", "#ff0000", "p1", {
        likes: 10, comments: 2, shares: 1, reach: 100, impressions: 500,
      }),
      makePostTag("t2", "design", "#00ff00", "p2", {
        likes: 100, comments: 50, shares: 30, reach: 1000, impressions: 5000,
      }),
    ]);

    const res = await GET(makeReq({ period: "30d" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { tags: Array<{ tagName: string; avgEngagement: number }> };
    expect(body.tags[0].tagName).toBe("design");
    expect(body.tags[0].avgEngagement).toBeGreaterThan(body.tags[1].avgEngagement);
  });

  it("counts totalTaggedPosts correctly across tags", async () => {
    (prisma.postTag.findMany as jest.Mock).mockResolvedValue([
      makePostTag("t1", "marketing", "#ff0000", "p1", null),
      makePostTag("t2", "design", "#00ff00", "p1", null),
      makePostTag("t1", "marketing", "#ff0000", "p2", null),
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { totalTaggedPosts: number };
    // p1 and p2 are the unique posts
    expect(body.totalTaggedPosts).toBe(2);
  });

  it("response shape matches TagPerformanceStat interface", async () => {
    (prisma.postTag.findMany as jest.Mock).mockResolvedValue([
      makePostTag("t1", "marketing", "#ff0000", "p1", {
        likes: 5, comments: 3, shares: 2, reach: 50, impressions: 200,
      }),
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { tags: Array<Record<string, unknown>> };
    const tag = body.tags[0];
    expect(tag).toHaveProperty("tagId");
    expect(tag).toHaveProperty("tagName", "marketing");
    expect(tag).toHaveProperty("tagColor", "#ff0000");
    expect(tag).toHaveProperty("postCount", 1);
    expect(tag).toHaveProperty("avgEngagement");
    expect(tag).toHaveProperty("totalEngagement");
    expect(tag).toHaveProperty("totalLikes", 5);
    expect(tag).toHaveProperty("totalComments", 3);
    expect(tag).toHaveProperty("totalShares", 2);
    expect(tag).toHaveProperty("totalReach", 50);
    expect(tag).toHaveProperty("totalImpressions", 200);
  });

  it("respects the limit param and returns only top N tags", async () => {
    // Create 5 tags each on a separate post
    const postTags = ["t1", "t2", "t3", "t4", "t5"].map((id, i) =>
      makePostTag(id, `tag-${i}`, "#000000", `p${i}`, {
        likes: i * 10, comments: i, shares: i, reach: i * 100, impressions: i * 500,
      })
    );
    (prisma.postTag.findMany as jest.Mock).mockResolvedValue(postTags);

    const res = await GET(makeReq({ limit: "3" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { tags: unknown[] };
    expect(body.tags).toHaveLength(3);
  });
});
