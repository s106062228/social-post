jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  PostStatus: { PUBLISHED: "PUBLISHED" },
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
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/writing-stats/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_HIT = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeReq(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  return new NextRequest(
    `http://localhost/api/analytics/writing-stats${qs ? `?${qs}` : ""}`
  );
}

function makePost(content: string, updatedAt: Date = new Date("2026-01-07T10:00:00Z")) {
  return { content, updatedAt };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/analytics/writing-stats", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_HIT);
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    const res = await GET(makeReq({ period: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns empty stats when no posts", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalPosts).toBe(0);
    expect(body.avgWordCount).toBe(0);
    expect(body.topEmojis).toEqual([]);
    expect(body.postingDayDistribution).toHaveLength(7);
    expect(body.postingHourDistribution).toHaveLength(24);
  });

  it("returns correct response shape with posts", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([
      makePost("Hello world #marketing https://example.com 🎉"),
      makePost("Short post"),
    ]);

    const res = await GET(makeReq({ period: "30d" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(typeof body.totalPosts).toBe("number");
    expect(typeof body.avgWordCount).toBe("number");
    expect(typeof body.avgCharCount).toBe("number");
    expect(typeof body.avgHashtagCount).toBe("number");
    expect(typeof body.avgSentenceCount).toBe("number");
    expect(typeof body.postsWithLinksPercent).toBe("number");
    expect(typeof body.postsWithEmojisPercent).toBe("number");
    expect(Array.isArray(body.topEmojis)).toBe(true);
    expect(Array.isArray(body.postingDayDistribution)).toBe(true);
    expect(Array.isArray(body.postingHourDistribution)).toBe(true);
    expect(body.period).toBe("30d");
  });

  it("accepts all valid period values", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([]);

    for (const period of ["30d", "90d", "180d", "all"]) {
      const res = await GET(makeReq({ period }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.period).toBe(period);
    }
  });

  it("computes postsWithLinksPercent correctly", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([
      makePost("See https://example.com here"),
      makePost("No link"),
    ]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.postsWithLinksPercent).toBe(50);
  });

  it("detects emoji usage correctly", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([
      makePost("Great 🎉"),
      makePost("No emoji"),
    ]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.postsWithEmojisPercent).toBe(50);
    expect(body.topEmojis[0]?.emoji).toBe("🎉");
  });

  it("handles DB error gracefully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockRejectedValue(new Error("DB down"));

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });
});
