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
import { GET } from "@/app/api/analytics/content-mix/route";
import type { ContentMixResponse } from "@/app/api/analytics/content-mix/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "cltest000000000000000001";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/content-mix${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function makePost(category: string | null, likes = 0, comments = 0, shares = 0, hasInsights = true) {
  return {
    contentCategory: category,
    publishResults: [
      {
        insights: hasInsights ? { likes, comments, shares } : null,
      },
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/content-mix", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  // ── Period validation ─────────────────────────────────────────────────────

  it("returns 400 for invalid period value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);

    const res = await GET(makeRequest({ period: "365d" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid query parameters");
  });

  it("defaults to 30d period when no param supplied", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentMixResponse;
    expect(data.period).toBe("30d");
  });

  it("accepts 7d, 30d, and 90d period values", async () => {
    for (const p of ["7d", "30d", "90d"]) {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockApiLimiter.mockResolvedValueOnce(RL_OK);
      mockFindMany.mockResolvedValueOnce([]);

      const res = await GET(makeRequest({ period: p }));
      expect(res.status).toBe(200);
      const data = (await res.json()) as ContentMixResponse;
      expect(data.period).toBe(p);
    }
  });

  // ── Response shape ────────────────────────────────────────────────────────

  it("returns correct shape with total and categories array", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([
      makePost("EDUCATIONAL", 10, 2, 1),
      makePost("PROMOTIONAL", 5, 1, 0),
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as ContentMixResponse;

    expect(data).toHaveProperty("period");
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("categories");
    expect(typeof data.total).toBe("number");
    expect(Array.isArray(data.categories)).toBe(true);

    for (const cat of data.categories) {
      expect(cat).toHaveProperty("category");
      expect(cat).toHaveProperty("count");
      expect(cat).toHaveProperty("percentage");
      expect(cat).toHaveProperty("avgEngagement");
      expect(typeof cat.category).toBe("string");
      expect(typeof cat.count).toBe("number");
      expect(typeof cat.percentage).toBe("number");
      expect(typeof cat.avgEngagement).toBe("number");
    }
  });

  // ── Sorting ───────────────────────────────────────────────────────────────

  it("sorts categories by count descending", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    // 1 PROMOTIONAL, 3 EDUCATIONAL, 2 ENTERTAINING
    mockFindMany.mockResolvedValueOnce([
      makePost("EDUCATIONAL"),
      makePost("EDUCATIONAL"),
      makePost("EDUCATIONAL"),
      makePost("ENTERTAINING"),
      makePost("ENTERTAINING"),
      makePost("PROMOTIONAL"),
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as ContentMixResponse;

    expect(data.categories[0].category).toBe("EDUCATIONAL");
    expect(data.categories[0].count).toBe(3);
    expect(data.categories[1].category).toBe("ENTERTAINING");
    expect(data.categories[1].count).toBe(2);
    expect(data.categories[2].category).toBe("PROMOTIONAL");
    expect(data.categories[2].count).toBe(1);
  });

  // ── Null category → UNCATEGORIZED ─────────────────────────────────────────

  it("maps null contentCategory to UNCATEGORIZED", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([
      makePost(null),
      makePost(null),
      makePost("NEWS"),
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as ContentMixResponse;

    const uncategorized = data.categories.find((c) => c.category === "UNCATEGORIZED");
    expect(uncategorized).toBeDefined();
    expect(uncategorized!.count).toBe(2);
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("returns empty categories and total=0 when no posts exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as ContentMixResponse;

    expect(data.total).toBe(0);
    expect(data.categories).toHaveLength(0);
  });

  // ── Engagement calculation ────────────────────────────────────────────────

  it("computes avgEngagement as (likes+comments+shares) / insightCount", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    // 2 EDUCATIONAL posts each with insights: engagement = 10+2+1=13 each → avg=13
    mockFindMany.mockResolvedValueOnce([
      makePost("EDUCATIONAL", 10, 2, 1),
      makePost("EDUCATIONAL", 10, 2, 1),
    ]);

    const res = await GET(makeRequest());
    const data = (await res.json()) as ContentMixResponse;

    const edu = data.categories.find((c) => c.category === "EDUCATIONAL");
    expect(edu).toBeDefined();
    expect(edu!.avgEngagement).toBe(13);
  });

  // ── DB error ─────────────────────────────────────────────────────────────

  it("returns 500 on unexpected DB error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Internal server error");
  });
});
