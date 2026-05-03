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
import { GET } from "@/app/api/analytics/word-cloud/route";
import type { WordCloudResponse } from "@/app/api/analytics/word-cloud/route";
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

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/word-cloud${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/word-cloud", () => {
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
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("returns 400 for invalid period value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await GET(makeRequest({ period: "14d" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid query parameters");
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("returns empty words array when no published posts exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as WordCloudResponse;
    expect(data.words).toHaveLength(0);
    expect(data.totalPosts).toBe(0);
  });

  // ── Period filter ─────────────────────────────────────────────────────────

  it("uses correct period in query and echoes it in response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as WordCloudResponse;
    expect(data.period).toBe("7d");

    // Verify the Prisma query used the right date range (approx 7 days ago)
    const callArgs = mockFindMany.mock.calls[0]?.[0] as { where: { updatedAt: { gte: Date } } };
    const since = callArgs.where.updatedAt.gte;
    const daysAgo = (Date.now() - since.getTime()) / 86_400_000;
    expect(daysAgo).toBeGreaterThan(6.9);
    expect(daysAgo).toBeLessThan(7.1);
  });

  // ── Frequency shape ───────────────────────────────────────────────────────

  it("returns sorted word counts and correct totalPosts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      { content: "marketing strategy content marketing" },
      { content: "digital marketing tips" },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as WordCloudResponse;

    expect(data.totalPosts).toBe(2);
    expect(data.words.length).toBeGreaterThan(0);

    // 'marketing' appears 3 times — should be first
    expect(data.words[0]?.text).toBe("marketing");
    expect(data.words[0]?.count).toBe(3);

    // Descending order
    for (let i = 1; i < data.words.length; i++) {
      expect(data.words[i - 1]!.count).toBeGreaterThanOrEqual(data.words[i]!.count);
    }
  });

  it("filters stop words from results", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      { content: "the quick brown fox jumps over the lazy dog" },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as WordCloudResponse;

    const texts = data.words.map((w) => w.text);
    expect(texts).not.toContain("the");
    expect(texts).not.toContain("over");
    expect(texts).toContain("quick");
    expect(texts).toContain("brown");
    expect(texts).toContain("jumps");
    expect(texts).toContain("lazy");
  });

  it("respects default limit of 50 words", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    // 60 unique words
    const content = Array.from({ length: 60 }, (_, i) => `uniqueword${i}`).join(" ");
    mockFindMany.mockResolvedValueOnce([{ content }]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as WordCloudResponse;
    expect(data.words.length).toBeLessThanOrEqual(50);
  });
});
