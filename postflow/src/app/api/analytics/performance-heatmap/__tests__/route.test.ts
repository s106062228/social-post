import { NextRequest } from "next/server";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@prisma/client", () => ({
  PublishStatus: { PUBLISHED: "PUBLISHED" },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: { publishResult: { findMany: jest.fn() } },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err: unknown) =>
    Response.json({ error: String(err) }, { status: 500 })
  ),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { GET } from "../route";

const AUTHED = { user: { id: "user-1" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

function makeReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/analytics/performance-heatmap");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

beforeEach(() => {
  jest.clearAllMocks();
  (auth as jest.Mock).mockResolvedValue(AUTHED);
  (apiLimiter as jest.Mock).mockResolvedValue(RL_OK);
  (prisma.publishResult.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/analytics/performance-heatmap", () => {
  it("returns 401 when unauthenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    (apiLimiter as jest.Mock).mockResolvedValue(RL_FAIL);
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid year format", async () => {
    const res = await GET(makeReq({ year: "abcd" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for year out of range", async () => {
    const res = await GET(makeReq({ year: "1999" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid metric", async () => {
    const res = await GET(makeReq({ metric: "invalid_metric" }));
    expect(res.status).toBe(400);
  });

  it("defaults to current year and score metric", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { year: number; metric: string };
    expect(body.year).toBe(new Date().getFullYear());
    expect(body.metric).toBe("score");
  });

  it("returns 365 days for a non-leap year", async () => {
    const res = await GET(makeReq({ year: "2023" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalDays: number; days: unknown[] };
    expect(body.totalDays).toBe(365);
    expect(body.days).toHaveLength(365);
  });

  it("returns 366 days for a leap year", async () => {
    const res = await GET(makeReq({ year: "2024" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalDays: number; days: unknown[] };
    expect(body.totalDays).toBe(366);
    expect(body.days).toHaveLength(366);
  });

  it("returns zero values when no insights exist", async () => {
    (prisma.publishResult.findMany as jest.Mock).mockResolvedValue([]);
    const res = await GET(makeReq({ year: "2023" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      maxValue: number;
      days: { value: number; postCount: number }[];
    };
    expect(body.maxValue).toBe(0);
    expect(body.days.every((d) => d.value === 0 && d.postCount === 0)).toBe(true);
  });

  it("aggregates insights by date correctly", async () => {
    (prisma.publishResult.findMany as jest.Mock).mockResolvedValue([
      {
        publishedAt: new Date("2023-03-15T10:00:00Z"),
        insights: { impressions: 100, reach: 80, likes: 10, comments: 2, shares: 3 },
      },
      {
        publishedAt: new Date("2023-03-15T14:00:00Z"),
        insights: { impressions: 200, reach: 160, likes: 20, comments: 4, shares: 6 },
      },
    ]);
    const res = await GET(makeReq({ year: "2023", metric: "likes" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      days: { date: string; value: number; postCount: number }[];
    };
    const march15 = body.days.find((d) => d.date === "2023-03-15");
    expect(march15).toBeDefined();
    expect(march15!.postCount).toBe(2);
    // avg likes = (10 + 20) / 2 = 15
    expect(march15!.value).toBeCloseTo(15, 1);
  });

  it("computes maxValue correctly", async () => {
    (prisma.publishResult.findMany as jest.Mock).mockResolvedValue([
      {
        publishedAt: new Date("2023-06-01T10:00:00Z"),
        insights: { impressions: 0, reach: 0, likes: 50, comments: 0, shares: 0 },
      },
      {
        publishedAt: new Date("2023-06-02T10:00:00Z"),
        insights: { impressions: 0, reach: 0, likes: 30, comments: 0, shares: 0 },
      },
    ]);
    const res = await GET(makeReq({ year: "2023", metric: "likes" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { maxValue: number };
    expect(body.maxValue).toBe(50);
  });

  it("skips results without publishedAt", async () => {
    (prisma.publishResult.findMany as jest.Mock).mockResolvedValue([
      {
        publishedAt: null,
        insights: { impressions: 1000, reach: 800, likes: 100, comments: 20, shares: 30 },
      },
    ]);
    const res = await GET(makeReq({ year: "2023" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { maxValue: number };
    expect(body.maxValue).toBe(0);
  });

  it("returns 500 on database error", async () => {
    (prisma.publishResult.findMany as jest.Mock).mockRejectedValue(new Error("DB failure"));
    const res = await GET(makeReq({ year: "2023" }));
    expect(res.status).toBe(500);
  });
});
