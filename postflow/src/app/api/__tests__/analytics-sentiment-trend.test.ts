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
import { GET } from "@/app/api/analytics/sentiment-trend/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/sentiment-trend${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function makePost(sentiment: string, daysAgo: number) {
  const updatedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return { sentiment, updatedAt };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue({ success: true });
  mockFindMany.mockResolvedValue([]);
});

describe("GET /api/analytics/sentiment-trend", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce({ success: false, limit: 100, remaining: 0, resetAt: new Date() });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    const res = await GET(makeRequest({ period: "999d" }));
    expect(res.status).toBe(400);
  });

  it("returns empty state when no posts have sentiment", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      period: string;
      days: unknown[];
      summary: { total: number; positiveRate: number };
    };
    expect(body.period).toBe("30d");
    expect(Array.isArray(body.days)).toBe(true);
    expect(body.summary.total).toBe(0);
    expect(body.summary.positiveRate).toBe(0);
  });

  it("returns 31 day entries for period=30d", async () => {
    const res = await GET(makeRequest({ period: "30d" }));
    const body = (await res.json()) as { days: unknown[] };
    expect(body.days).toHaveLength(31);
  });

  it("returns 91 day entries for period=90d", async () => {
    const res = await GET(makeRequest({ period: "90d" }));
    const body = (await res.json()) as { days: unknown[] };
    expect(body.days).toHaveLength(91);
  });

  it("returns 181 day entries for period=180d", async () => {
    const res = await GET(makeRequest({ period: "180d" }));
    const body = (await res.json()) as { days: unknown[] };
    expect(body.days).toHaveLength(181);
  });

  it("correctly aggregates positive, neutral, and negative counts in summary", async () => {
    mockFindMany.mockResolvedValueOnce([
      makePost("POSITIVE", 1),
      makePost("POSITIVE", 2),
      makePost("NEUTRAL", 3),
      makePost("NEGATIVE", 4),
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      summary: { positive: number; neutral: number; negative: number; total: number; positiveRate: number };
    };
    expect(body.summary.positive).toBe(2);
    expect(body.summary.neutral).toBe(1);
    expect(body.summary.negative).toBe(1);
    expect(body.summary.total).toBe(4);
    expect(body.summary.positiveRate).toBe(50);
  });

  it("each day entry has expected shape", async () => {
    mockFindMany.mockResolvedValueOnce([makePost("POSITIVE", 1)]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as {
      days: { date: string; positive: number; neutral: number; negative: number; total: number }[];
    };

    for (const day of body.days) {
      expect(typeof day.date).toBe("string");
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof day.positive).toBe("number");
      expect(typeof day.neutral).toBe("number");
      expect(typeof day.negative).toBe("number");
      expect(day.total).toBe(day.positive + day.neutral + day.negative);
    }
  });

  it("handles case-insensitive sentiment values", async () => {
    mockFindMany.mockResolvedValueOnce([
      makePost("positive", 1),
      makePost("Negative", 2),
      makePost("NEUTRAL", 3),
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as {
      summary: { positive: number; neutral: number; negative: number };
    };
    expect(body.summary.positive).toBe(1);
    expect(body.summary.negative).toBe(1);
    expect(body.summary.neutral).toBe(1);
  });

  it("positiveRate is 100 when all posts are positive", async () => {
    mockFindMany.mockResolvedValueOnce([
      makePost("POSITIVE", 1),
      makePost("POSITIVE", 2),
      makePost("POSITIVE", 3),
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as { summary: { positiveRate: number } };
    expect(body.summary.positiveRate).toBe(100);
  });

  it("queries only PUBLISHED posts with non-null sentiment from the user", async () => {
    await GET(makeRequest({ period: "30d" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: MOCK_USER_ID,
          status: "PUBLISHED",
          sentiment: { not: null },
        }),
      })
    );
  });
});
