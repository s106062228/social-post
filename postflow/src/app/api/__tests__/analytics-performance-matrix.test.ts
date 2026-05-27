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
import { GET } from "@/app/api/analytics/performance-matrix/route";
import type { PerformanceMatrixResponse } from "@/app/api/analytics/performance-matrix/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/performance-matrix${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function makePost(
  category: string | null,
  platform: string,
  likes: number,
  comments: number,
  shares: number
) {
  return {
    contentCategory: category,
    publishResults: [
      {
        platform,
        insights: { likes, comments, shares },
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
  mockPostFindMany.mockResolvedValue([]);
});

// ── Auth ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/performance-matrix", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  // ── Period validation ───────────────────────────────────────────────────────

  it("returns 400 for invalid period", async () => {
    const res = await GET(makeRequest({ period: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("accepts valid period values", async () => {
    for (const p of ["30d", "90d", "all"]) {
      const res = await GET(makeRequest({ period: p }));
      expect(res.status).toBe(200);
    }
  });

  // ── Response shape ──────────────────────────────────────────────────────────

  it("returns correct response shape", async () => {
    const res = await GET(makeRequest({ period: "30d" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as PerformanceMatrixResponse;
    expect(body).toHaveProperty("period", "30d");
    expect(Array.isArray(body.matrix)).toBe(true);
    expect(Array.isArray(body.platforms)).toBe(true);
    expect(Array.isArray(body.categories)).toBe(true);
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it("returns empty matrix when no posts", async () => {
    mockPostFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as PerformanceMatrixResponse;
    expect(body.matrix).toHaveLength(0);
    expect(body.platforms).toHaveLength(0);
    expect(body.categories).toHaveLength(0);
  });

  // ── Matrix aggregation ──────────────────────────────────────────────────────

  it("aggregates engagement per category × platform", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost("EDUCATIONAL", "FACEBOOK", 10, 2, 1),
      makePost("EDUCATIONAL", "FACEBOOK", 20, 4, 2),
    ]);

    const res = await GET(makeRequest({ period: "30d" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as PerformanceMatrixResponse;

    // Should have 1 cell: FACEBOOK×EDUCATIONAL
    expect(body.matrix).toHaveLength(1);
    const cell = body.matrix[0];
    expect(cell.platform).toBe("FACEBOOK");
    expect(cell.category).toBe("EDUCATIONAL");
    expect(cell.postCount).toBe(2);
    // avg engagement: (13 + 26) / 2 = 19.5
    expect(cell.avgEngagement).toBe(19.5);
  });

  it("handles null contentCategory as UNCATEGORIZED", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost(null, "INSTAGRAM", 5, 1, 0),
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as PerformanceMatrixResponse;

    expect(body.categories).toContain("UNCATEGORIZED");
    const cell = body.matrix.find((c) => c.category === "UNCATEGORIZED");
    expect(cell).toBeDefined();
    expect(cell?.platform).toBe("INSTAGRAM");
  });

  it("returns single platform when all posts on one platform", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost("PROMOTIONAL", "TWITTER", 3, 1, 0),
      makePost("ENGAGING", "TWITTER", 8, 2, 1),
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as PerformanceMatrixResponse;
    expect(body.platforms).toEqual(["TWITTER"]);
    expect(body.matrix).toHaveLength(2);
  });

  it("returns multiple categories and platforms", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost("EDUCATIONAL", "FACEBOOK", 10, 2, 1),
      makePost("PROMOTIONAL", "INSTAGRAM", 5, 1, 0),
      makePost("EDUCATIONAL", "INSTAGRAM", 15, 3, 2),
      makePost("PROMOTIONAL", "FACEBOOK", 8, 2, 1),
    ]);

    const res = await GET(makeRequest({ period: "90d" }));
    const body = (await res.json()) as PerformanceMatrixResponse;

    expect(body.platforms.sort()).toEqual(["FACEBOOK", "INSTAGRAM"]);
    expect(body.categories.sort()).toEqual(["EDUCATIONAL", "PROMOTIONAL"]);
    // Should have 4 cells
    expect(body.matrix).toHaveLength(4);
  });

  it("handles posts with no insights (zero engagement)", async () => {
    mockPostFindMany.mockResolvedValue([
      {
        contentCategory: "NEWS",
        publishResults: [
          { platform: "THREADS", insights: null },
        ],
      },
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as PerformanceMatrixResponse;
    const cell = body.matrix[0];
    expect(cell.avgEngagement).toBe(0);
    expect(cell.postCount).toBe(1);
  });
});
