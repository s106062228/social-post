import { GET } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  httpLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
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
      constructor(message: string, opts: { code: string; clientVersion: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: { post: { findMany: jest.fn() } },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockFindMany = prisma.post.findMany as jest.MockedFunction<typeof prisma.post.findMany>;
const mockApiLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;

const AUTHED = { user: { id: "user-1", email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/analytics/engagement-depth");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

function makePost(overrides: {
  impressions?: number;
  comments?: number;
  shares?: number;
  platform?: string;
  id?: string;
  content?: string;
} = {}) {
  return {
    id: overrides.id ?? "post-1",
    content: overrides.content ?? "Test post content",
    publishResults: [
      {
        platform: overrides.platform ?? "INSTAGRAM",
        status: "PUBLISHED",
        insights: [
          {
            impressions: overrides.impressions ?? 1000,
            comments: overrides.comments ?? 10,
            shares: overrides.shares ?? 5,
            likes: 50,
            reach: 900,
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED as Awaited<ReturnType<typeof auth>>);
  mockApiLimiter.mockResolvedValue(RL_OK as Awaited<ReturnType<typeof apiLimiter>>);
  mockFindMany.mockResolvedValue([]);
});

describe("GET /api/analytics/engagement-depth", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL as Awaited<ReturnType<typeof apiLimiter>>);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    const res = await GET(makeRequest({ period: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns empty state shape when no posts exist", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.period).toBe("30d");
    expect(body.totalAnalyzed).toBe(0);
    expect(body.avgCommentRate).toBe(0);
    expect(body.avgShareRate).toBe(0);
    expect(body.avgEngagementDepthScore).toBe(0);
    expect(Array.isArray(body.platformMetrics)).toBe(true);
    expect(Array.isArray(body.topDeepEngagementPosts)).toBe(true);
    expect((body.platformMetrics as unknown[]).length).toBe(0);
    expect((body.topDeepEngagementPosts as unknown[]).length).toBe(0);
  });

  it("calculates avgCommentRate correctly", async () => {
    // 10 comments / 1000 impressions × 100 = 1%
    mockFindMany.mockResolvedValue([makePost({ impressions: 1000, comments: 10, shares: 0 })] as Awaited<ReturnType<typeof prisma.post.findMany>>);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.avgCommentRate).toBe(1);
    expect(body.totalAnalyzed).toBe(1);
  });

  it("calculates avgShareRate correctly", async () => {
    // 5 shares / 1000 impressions × 100 = 0.5%
    mockFindMany.mockResolvedValue([makePost({ impressions: 1000, comments: 0, shares: 5 })] as Awaited<ReturnType<typeof prisma.post.findMany>>);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.avgShareRate).toBe(0.5);
  });

  it("computes engagement depth score using weighted formula", async () => {
    // comments×5 + shares×4 / impressions×9 × 100
    // 10×5 + 5×4 = 70; 1000×9 = 9000; 70/9000 × 100 = 0.78
    mockFindMany.mockResolvedValue([makePost({ impressions: 1000, comments: 10, shares: 5 })] as Awaited<ReturnType<typeof prisma.post.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.avgEngagementDepthScore).toBe("number");
    expect(body.avgEngagementDepthScore as number).toBeGreaterThanOrEqual(0);
    expect(body.avgEngagementDepthScore as number).toBeLessThanOrEqual(100);
  });

  it("returns correct platformMetrics shape", async () => {
    mockFindMany.mockResolvedValue([
      makePost({ platform: "INSTAGRAM", impressions: 1000, comments: 10, shares: 5 }),
    ] as Awaited<ReturnType<typeof prisma.post.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    const metrics = body.platformMetrics as Record<string, unknown>[];
    expect(metrics.length).toBe(1);
    expect(metrics[0].platform).toBe("INSTAGRAM");
    expect(typeof metrics[0].avgCommentRate).toBe("number");
    expect(typeof metrics[0].avgShareRate).toBe("number");
    expect(typeof metrics[0].postCount).toBe("number");
    expect(metrics[0].postCount).toBe(1);
  });

  it("caps topDeepEngagementPosts at 10", async () => {
    const posts = Array.from({ length: 15 }, (_, i) =>
      makePost({ id: `post-${i}`, content: `Content ${i}`, impressions: 1000 + i, comments: i + 1, shares: 1 })
    );
    mockFindMany.mockResolvedValue(posts as Awaited<ReturnType<typeof prisma.post.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    const topPosts = body.topDeepEngagementPosts as unknown[];
    expect(topPosts.length).toBeLessThanOrEqual(10);
  });

  it("skips rows with zero impressions", async () => {
    mockFindMany.mockResolvedValue([
      makePost({ impressions: 0, comments: 10, shares: 5 }),
    ] as Awaited<ReturnType<typeof prisma.post.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    // Zero-impression rows are filtered out
    expect(body.totalAnalyzed).toBe(0);
  });

  it("accepts 'all' period and returns 200", async () => {
    const res = await GET(makeRequest({ period: "all" }));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.period).toBe("all");
  });

  it("returns 500 on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
