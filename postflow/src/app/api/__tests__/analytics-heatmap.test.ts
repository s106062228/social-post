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
import { GET } from "@/app/api/analytics/heatmap/route";
import type { HeatmapResponse } from "@/app/api/analytics/heatmap/route";
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

function makeRequest(year?: string): NextRequest {
  const url = year
    ? `http://localhost:3000/api/analytics/heatmap?year=${year}`
    : "http://localhost:3000/api/analytics/heatmap";
  return new NextRequest(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
  mockFindMany.mockResolvedValue([]);
});

describe("GET /api/analytics/heatmap", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for an invalid year param", async () => {
    const res = await GET(makeRequest("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 365 days for a non-leap year", async () => {
    const res = await GET(makeRequest("2023"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as HeatmapResponse;
    expect(body.year).toBe(2023);
    expect(body.days).toHaveLength(365);
  });

  it("returns 366 days for a leap year", async () => {
    const res = await GET(makeRequest("2024"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as HeatmapResponse;
    expect(body.days).toHaveLength(366);
  });

  it("returns zero counts when no posts", async () => {
    const res = await GET(makeRequest("2024"));
    const body = (await res.json()) as HeatmapResponse;
    expect(body.totalPosts).toBe(0);
    expect(body.maxDay).toBe(0);
    expect(body.days.every((d) => d.count === 0)).toBe(true);
  });

  it("counts published posts by updatedAt date", async () => {
    mockFindMany.mockResolvedValue([
      { status: "PUBLISHED", updatedAt: new Date("2024-06-15T10:00:00Z"), scheduledAt: null },
      { status: "PUBLISHED", updatedAt: new Date("2024-06-15T14:00:00Z"), scheduledAt: null },
      { status: "PUBLISHED", updatedAt: new Date("2024-07-01T08:00:00Z"), scheduledAt: null },
    ]);
    const res = await GET(makeRequest("2024"));
    const body = (await res.json()) as HeatmapResponse;
    expect(body.totalPosts).toBe(3);
    expect(body.maxDay).toBe(2);
    const june15 = body.days.find((d) => d.date === "2024-06-15");
    expect(june15?.count).toBe(2);
    const july1 = body.days.find((d) => d.date === "2024-07-01");
    expect(july1?.count).toBe(1);
  });

  it("counts scheduled posts by scheduledAt date", async () => {
    mockFindMany.mockResolvedValue([
      {
        status: "SCHEDULED",
        scheduledAt: new Date("2024-03-10T09:00:00Z"),
        updatedAt: new Date("2024-03-01T00:00:00Z"),
      },
    ]);
    const res = await GET(makeRequest("2024"));
    const body = (await res.json()) as HeatmapResponse;
    const march10 = body.days.find((d) => d.date === "2024-03-10");
    expect(march10?.count).toBe(1);
  });

  it("days array starts with Jan 1 and ends with Dec 31", async () => {
    const res = await GET(makeRequest("2023"));
    const body = (await res.json()) as HeatmapResponse;
    expect(body.days[0].date).toBe("2023-01-01");
    expect(body.days[364].date).toBe("2023-12-31");
  });
});
