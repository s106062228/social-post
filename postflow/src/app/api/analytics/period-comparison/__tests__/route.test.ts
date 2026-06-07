jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
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
import { GET } from "@/app/api/analytics/period-comparison/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/analytics/period-comparison");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

function makePostWithInsights(opts: {
  likes?: number;
  comments?: number;
  shares?: number;
  reach?: number;
  impressions?: number;
  platform?: string;
} = {}): object {
  return {
    id: "post1",
    publishResults: [
      {
        platform: opts.platform ?? "FACEBOOK",
        insights: {
          likes: opts.likes ?? 10,
          comments: opts.comments ?? 5,
          shares: opts.shares ?? 2,
          reach: opts.reach ?? 100,
          impressions: opts.impressions ?? 200,
        },
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
  // Default: return empty for both current + previous periods
  mockFindMany.mockResolvedValue([]);
});

// ── auth ──────────────────────────────────────────────────────────────────────

test("returns 401 when unauthenticated", async () => {
  mockAuth.mockResolvedValueOnce(null);
  const res = await GET(makeRequest());
  expect(res.status).toBe(401);
});

// ── rate limit ────────────────────────────────────────────────────────────────

test("returns 429 when rate limit exceeded", async () => {
  mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
  const res = await GET(makeRequest());
  expect(res.status).toBe(429);
});

// ── period validation ─────────────────────────────────────────────────────────

test("returns 400 for invalid period", async () => {
  const res = await GET(makeRequest({ period: "365d" }));
  expect(res.status).toBe(400);
});

test("accepts valid period 7d", async () => {
  const res = await GET(makeRequest({ period: "7d" }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { period: string };
  expect(body.period).toBe("7d");
});

test("accepts valid period 90d", async () => {
  const res = await GET(makeRequest({ period: "90d" }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { period: string };
  expect(body.period).toBe("90d");
});

// ── current/previous bucket split ─────────────────────────────────────────────

test("calls findMany twice (current + previous periods)", async () => {
  await GET(makeRequest({ period: "30d" }));
  expect(mockFindMany).toHaveBeenCalledTimes(2);
});

// ── response shape ────────────────────────────────────────────────────────────

test("response has correct shape", async () => {
  const res = await GET(makeRequest({ period: "30d" }));
  const body = (await res.json()) as Record<string, unknown>;
  expect(body).toHaveProperty("period", "30d");
  expect(body).toHaveProperty("current");
  expect(body).toHaveProperty("previous");
  expect(body).toHaveProperty("deltas");
  const current = body.current as Record<string, unknown>;
  expect(current).toHaveProperty("posts");
  expect(current).toHaveProperty("engagement");
  expect(current).toHaveProperty("reach");
  expect(current).toHaveProperty("impressions");
  expect(current).toHaveProperty("avgEngagementRate");
  expect(current).toHaveProperty("platformBreakdown");
});

// ── delta calculation ─────────────────────────────────────────────────────────

test("delta is null when previous period has zero posts", async () => {
  // current period returns 1 post, previous returns 0
  mockFindMany
    .mockResolvedValueOnce([makePostWithInsights({ likes: 5, comments: 2, shares: 1, reach: 50, impressions: 100 })])
    .mockResolvedValueOnce([]);

  const res = await GET(makeRequest({ period: "30d" }));
  const body = (await res.json()) as { deltas: { posts: number | null } };
  expect(body.deltas.posts).toBeNull();
});

test("computes positive delta when current > previous", async () => {
  // current: 2 posts, previous: 1 post → delta = 100%
  mockFindMany
    .mockResolvedValueOnce([
      makePostWithInsights(),
      makePostWithInsights({ platform: "INSTAGRAM" }),
    ])
    .mockResolvedValueOnce([makePostWithInsights()]);

  const res = await GET(makeRequest({ period: "30d" }));
  const body = (await res.json()) as { deltas: { posts: number } };
  expect(body.deltas.posts).toBe(100);
});

// ── platform breakdown ────────────────────────────────────────────────────────

test("platform breakdown shape is correct", async () => {
  mockFindMany
    .mockResolvedValueOnce([makePostWithInsights({ platform: "FACEBOOK" })])
    .mockResolvedValueOnce([]);

  const res = await GET(makeRequest({ period: "30d" }));
  const body = (await res.json()) as { current: { platformBreakdown: { platform: string; posts: number; engagement: number }[] } };
  const breakdown = body.current.platformBreakdown;
  expect(Array.isArray(breakdown)).toBe(true);
  expect(breakdown[0]).toHaveProperty("platform");
  expect(breakdown[0]).toHaveProperty("posts");
  expect(breakdown[0]).toHaveProperty("engagement");
});

// ── empty state ───────────────────────────────────────────────────────────────

test("returns zero metrics when no posts exist", async () => {
  const res = await GET(makeRequest({ period: "30d" }));
  const body = (await res.json()) as { current: { posts: number; engagement: number } };
  expect(body.current.posts).toBe(0);
  expect(body.current.engagement).toBe(0);
});
