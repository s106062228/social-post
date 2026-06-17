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
  prisma: { publishResult: { findMany: jest.fn() } },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockFindMany = prisma.publishResult.findMany as jest.MockedFunction<
  typeof prisma.publishResult.findMany
>;
const mockApiLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;

const AUTHED = { user: { id: "user-1", email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/analytics/engagement-funnel");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED as Awaited<ReturnType<typeof auth>>);
  mockApiLimiter.mockResolvedValue(RL_OK as Awaited<ReturnType<typeof apiLimiter>>);
  mockFindMany.mockResolvedValue([]);
});

describe("GET /api/analytics/engagement-funnel", () => {
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
    const res = await GET(makeRequest({ period: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with correct empty shape when no data", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.period).toBe("30d");
    const overall = body.overall as Record<string, unknown>;
    expect(overall.impressions).toBe(0);
    expect(overall.reach).toBe(0);
    expect(overall.engagement).toBe(0);
    expect(overall.reachRate).toBeNull();
    expect(overall.engagementRate).toBeNull();
    expect(overall.engagementFromReachRate).toBeNull();
    expect(Array.isArray(body.platforms)).toBe(true);
    expect((body.platforms as unknown[]).length).toBe(0);
    expect(body.topPlatform).toBeNull();
  });

  it("defaults to 30d period", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.period).toBe("30d");
  });

  it("echoes the requested period", async () => {
    const res = await GET(makeRequest({ period: "90d" }));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.period).toBe("90d");
  });

  it("aggregates impressions, reach, and engagement from insights", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "r1",
        platform: "INSTAGRAM",
        status: "PUBLISHED",
        publishedAt: new Date(),
        insights: [
          { impressions: 1000, reach: 600, likes: 50, comments: 10, shares: 5 },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.publishResult.findMany>>);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const overall = body.overall as Record<string, unknown>;
    expect(overall.impressions).toBe(1000);
    expect(overall.reach).toBe(600);
    expect(overall.engagement).toBe(65); // 50+10+5
  });

  it("computes reachRate and engagementRate correctly", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "r1",
        platform: "FACEBOOK",
        status: "PUBLISHED",
        publishedAt: new Date(),
        insights: [
          { impressions: 1000, reach: 500, likes: 100, comments: 0, shares: 0 },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.publishResult.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    const overall = body.overall as Record<string, unknown>;
    expect(overall.reachRate).toBe(50); // 500/1000*100
    expect(overall.engagementRate).toBe(10); // 100/1000*100
    expect(overall.engagementFromReachRate).toBe(20); // 100/500*100
  });

  it("returns per-platform breakdown sorted by impressions desc", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "r1",
        platform: "INSTAGRAM",
        status: "PUBLISHED",
        publishedAt: new Date(),
        insights: [{ impressions: 500, reach: 300, likes: 30, comments: 5, shares: 2 }],
      },
      {
        id: "r2",
        platform: "FACEBOOK",
        status: "PUBLISHED",
        publishedAt: new Date(),
        insights: [{ impressions: 2000, reach: 1200, likes: 80, comments: 20, shares: 10 }],
      },
    ] as Awaited<ReturnType<typeof prisma.publishResult.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    const platforms = body.platforms as Record<string, unknown>[];
    expect(platforms.length).toBe(2);
    expect(platforms[0].platform).toBe("FACEBOOK");
    expect(platforms[1].platform).toBe("INSTAGRAM");
  });

  it("identifies the topPlatform by engagement rate", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "r1",
        platform: "THREADS",
        status: "PUBLISHED",
        publishedAt: new Date(),
        insights: [{ impressions: 100, reach: 80, likes: 20, comments: 5, shares: 5 }],
      },
      {
        id: "r2",
        platform: "FACEBOOK",
        status: "PUBLISHED",
        publishedAt: new Date(),
        insights: [{ impressions: 10000, reach: 5000, likes: 100, comments: 10, shares: 5 }],
      },
    ] as Awaited<ReturnType<typeof prisma.publishResult.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    // THREADS: 30/100 = 30% engagement rate vs FACEBOOK: 115/10000 = 1.15%
    expect(body.topPlatform).toBe("THREADS");
  });

  it("handles multiple insights per publish result", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "r1",
        platform: "TWITTER",
        status: "PUBLISHED",
        publishedAt: new Date(),
        insights: [
          { impressions: 300, reach: 200, likes: 10, comments: 2, shares: 1 },
          { impressions: 200, reach: 100, likes: 5, comments: 1, shares: 0 },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.publishResult.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    const overall = body.overall as Record<string, unknown>;
    expect(overall.impressions).toBe(500);
    expect(overall.reach).toBe(300);
    expect(overall.engagement).toBe(19); // (10+2+1)+(5+1+0)
  });

  it("returns 500 on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
