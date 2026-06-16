import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findMany: jest.fn(), count: jest.fn() },
    socialAccount: { count: jest.fn() },
    publishResult: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err: unknown) =>
    new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  ),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { GET } from "@/app/api/analytics/content-health/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockRl = apiLimiter as jest.MockedFunction<typeof apiLimiter>;

const rlAllow = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const rlDeny = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

function makeReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/analytics/content-health");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function makePrismaPost(category: string | null = "EDUCATIONAL", recycled = false) {
  return {
    contentCategory: category,
    archivedAt: null,
    updatedAt: new Date(),
    isEvergreen: recycled,
    publishResults: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as never);
  mockRl.mockResolvedValue(rlAllow);

  // Default: two findMany calls (current posts + prior posts) + count for recycled
  (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.post.count as jest.Mock).mockResolvedValue(0);
  (prisma.socialAccount.count as jest.Mock).mockResolvedValue(2);
  (prisma.publishResult.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/analytics/content-health", () => {
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
    const res = await GET(makeReq({ period: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with valid shape for empty data", async () => {
    const res = await GET(makeReq({ period: "30d" }));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("overallScore");
    expect(body).toHaveProperty("overallLabel");
    expect(body).toHaveProperty("dimensions");
    expect(body).toHaveProperty("recommendations");
    expect(body).toHaveProperty("period", "30d");
  });

  it("returns 5 dimensions", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { dimensions: unknown[] };
    expect(body.dimensions).toHaveLength(5);
  });

  it("echoes the period in the response", async () => {
    const res = await GET(makeReq({ period: "90d" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { period: string };
    expect(body.period).toBe("90d");
  });

  it("defaults to 30d period", async () => {
    const res = await GET(makeReq());
    const body = await res.json() as { period: string };
    expect(body.period).toBe("30d");
  });

  it("overall score is within 0-100 bounds", async () => {
    (prisma.post.findMany as jest.Mock).mockResolvedValue([
      makePrismaPost("EDUCATIONAL"),
      makePrismaPost("ENTERTAINING"),
      makePrismaPost("PROMOTIONAL"),
    ]);
    (prisma.socialAccount.count as jest.Mock).mockResolvedValue(2);
    (prisma.publishResult.findMany as jest.Mock).mockResolvedValue([
      { accountId: "acc1" },
      { accountId: "acc2" },
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { overallScore: number };
    expect(body.overallScore).toBeGreaterThanOrEqual(0);
    expect(body.overallScore).toBeLessThanOrEqual(100);
  });

  it("each dimension has name, score, max, label, detail", async () => {
    const res = await GET(makeReq());
    const body = await res.json() as { dimensions: Array<Record<string, unknown>> };
    for (const dim of body.dimensions) {
      expect(typeof dim.name).toBe("string");
      expect(typeof dim.score).toBe("number");
      expect(typeof dim.max).toBe("number");
      expect(typeof dim.label).toBe("string");
      expect(typeof dim.detail).toBe("string");
    }
  });

  it("recommendations is a non-empty array", async () => {
    const res = await GET(makeReq());
    const body = await res.json() as { recommendations: unknown[] };
    expect(Array.isArray(body.recommendations)).toBe(true);
    expect(body.recommendations.length).toBeGreaterThan(0);
  });

  it("higher diversity score with more categories", async () => {
    (prisma.post.findMany as jest.Mock).mockImplementation((args: { where?: { updatedAt?: { lt?: Date } } }) => {
      // Current period: return 5 diverse posts; prior period: return empty
      if (args?.where?.updatedAt?.lt) return Promise.resolve([]);
      return Promise.resolve([
        makePrismaPost("EDUCATIONAL"),
        makePrismaPost("ENTERTAINING"),
        makePrismaPost("PROMOTIONAL"),
        makePrismaPost("ENGAGING"),
        makePrismaPost("INSPIRING"),
      ]);
    });

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { dimensions: Array<{ name: string; score: number; max: number }> };
    const div = body.dimensions.find((d) => d.name === "Content Diversity");
    expect(div!.score).toBe(div!.max); // 5 categories = full marks
  });
});
