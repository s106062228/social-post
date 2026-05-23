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
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
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
    post: {
      findMany: jest.fn(),
    },
    publishResult: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/monthly-summary/route";
import type { MonthlySummaryResponse } from "@/app/api/analytics/monthly-summary/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockPublishResultFindMany = prisma.publishResult.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_HIT = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeReq(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  return new NextRequest(
    `http://localhost/api/analytics/monthly-summary${qs ? `?${qs}` : ""}`
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);
  mockPostFindMany.mockResolvedValue([]);
  mockPublishResultFindMany.mockResolvedValue([]);
});

describe("GET /api/analytics/monthly-summary", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_HIT);
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid year param (non-numeric)", async () => {
    const res = await GET(makeReq({ year: "abc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid month param (out of range)", async () => {
    const res = await GET(makeReq({ year: "2026", month: "13" }));
    expect(res.status).toBe(400);
  });

  it("defaults to current year and month when params not provided", async () => {
    const now = new Date();
    const expectedYear = now.getUTCFullYear();
    const expectedMonth = now.getUTCMonth() + 1;

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as MonthlySummaryResponse;
    expect(body.year).toBe(expectedYear);
    expect(body.month).toBe(expectedMonth);
  });

  it("returns correct response shape", async () => {
    mockPostFindMany.mockResolvedValue([
      {
        status: "PUBLISHED",
        updatedAt: new Date("2026-03-10T10:00:00Z"),
        scheduledAt: null,
      },
    ]);
    mockPublishResultFindMany.mockResolvedValue([
      { platform: "FACEBOOK" },
    ]);

    const res = await GET(makeReq({ year: "2026", month: "3" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as MonthlySummaryResponse;

    expect(typeof body.year).toBe("number");
    expect(typeof body.month).toBe("number");
    expect(typeof body.totalPosts).toBe("number");
    expect(typeof body.byStatus).toBe("object");
    expect(Array.isArray(body.byPlatform)).toBe(true);
    expect(typeof body.avgPostsPerDay).toBe("number");
    expect(typeof body.quietDays).toBe("number");
    expect(Array.isArray(body.weekdayDistribution)).toBe(true);
    expect(body.weekdayDistribution).toHaveLength(7);
    expect(body.year).toBe(2026);
    expect(body.month).toBe(3);
  });

  it("identifies the busiest day correctly", async () => {
    mockPostFindMany.mockResolvedValue([
      { status: "PUBLISHED", updatedAt: new Date("2026-03-05T09:00:00Z"), scheduledAt: null },
      { status: "PUBLISHED", updatedAt: new Date("2026-03-05T14:00:00Z"), scheduledAt: null },
      { status: "PUBLISHED", updatedAt: new Date("2026-03-05T17:00:00Z"), scheduledAt: null },
      { status: "PUBLISHED", updatedAt: new Date("2026-03-10T10:00:00Z"), scheduledAt: null },
    ]);

    const res = await GET(makeReq({ year: "2026", month: "3" }));
    const body = (await res.json()) as MonthlySummaryResponse;

    expect(body.busiestDay).not.toBeNull();
    expect(body.busiestDay?.date).toBe("2026-03-05");
    expect(body.busiestDay?.count).toBe(3);
  });

  it("counts quietDays correctly", async () => {
    // March 2026 has 31 days; if only 2 dates have posts, quietDays = 31 - 2
    mockPostFindMany.mockResolvedValue([
      { status: "PUBLISHED", updatedAt: new Date("2026-03-01T10:00:00Z"), scheduledAt: null },
      { status: "PUBLISHED", updatedAt: new Date("2026-03-15T10:00:00Z"), scheduledAt: null },
      { status: "PUBLISHED", updatedAt: new Date("2026-03-15T14:00:00Z"), scheduledAt: null },
    ]);

    const res = await GET(makeReq({ year: "2026", month: "3" }));
    const body = (await res.json()) as MonthlySummaryResponse;

    // 2 distinct dates with posts → quietDays = 31 - 2 = 29
    expect(body.quietDays).toBe(29);
  });

  it("weekdayDistribution always has 7 entries (Sun-Sat)", async () => {
    const res = await GET(makeReq({ year: "2026", month: "3" }));
    const body = (await res.json()) as MonthlySummaryResponse;

    expect(body.weekdayDistribution).toHaveLength(7);
    expect(body.weekdayDistribution[0].dayName).toBe("Sun");
    expect(body.weekdayDistribution[6].dayName).toBe("Sat");
  });

  it("returns totalPosts=0 and busiestDay=null for empty month", async () => {
    const res = await GET(makeReq({ year: "2026", month: "3" }));
    const body = (await res.json()) as MonthlySummaryResponse;

    expect(body.totalPosts).toBe(0);
    expect(body.busiestDay).toBeNull();
    expect(body.byPlatform).toEqual([]);
    expect(body.byStatus).toEqual({});
  });

  it("includes SCHEDULED posts using scheduledAt date", async () => {
    mockPostFindMany.mockResolvedValue([
      {
        status: "SCHEDULED",
        scheduledAt: new Date("2026-03-20T15:00:00Z"),
        updatedAt: new Date("2026-03-01T00:00:00Z"), // different date, should not be used
      },
    ]);

    const res = await GET(makeReq({ year: "2026", month: "3" }));
    const body = (await res.json()) as MonthlySummaryResponse;

    expect(body.totalPosts).toBe(1);
    expect(body.byStatus["SCHEDULED"]).toBe(1);
    expect(body.busiestDay?.date).toBe("2026-03-20");
  });
});
