jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
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
import { GET } from "@/app/api/analytics/content-fatigue/route";
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
  const url = `http://localhost:3000/api/analytics/content-fatigue${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function makePublishedResult(platform: string, daysAgo: number) {
  const publishedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return {
    platform,
    status: "PUBLISHED",
    publishedAt,
    insights: { likes: 10, comments: 2, shares: 1, reach: 100, impressions: 500 },
  };
}

describe("GET /api/analytics/content-fatigue", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      resetAt: new Date(),
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns correct response shape with no data", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      overallFatigued: boolean;
      platforms: unknown[];
      analyzedAt: string;
    };
    expect(body.overallFatigued).toBe(false);
    expect(body.platforms).toEqual([]);
    expect(typeof body.analyzedAt).toBe("string");
  });

  it("queries posts from the last 30 days", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);

    await GET(makeRequest());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: MOCK_USER_ID,
        }),
      })
    );
  });

  it("returns platform data when posts exist", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([
      { publishResults: [makePublishedResult("INSTAGRAM", 2)] },
      { publishResults: [makePublishedResult("INSTAGRAM", 10)] },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { platforms: { platform: string }[] };
    expect(body.platforms.some((p) => p.platform === "INSTAGRAM")).toBe(true);
  });

  it("filters by platform query param", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([
      { publishResults: [makePublishedResult("INSTAGRAM", 2)] },
      { publishResults: [makePublishedResult("FACEBOOK", 2)] },
    ]);

    const res = await GET(makeRequest({ platform: "INSTAGRAM" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { platforms: { platform: string }[] };
    expect(body.platforms).toHaveLength(1);
    expect(body.platforms[0]!.platform).toBe("INSTAGRAM");
  });

  it("reflects fatigued state in response", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(null);

    // Recent post: very low engagement
    // Baseline posts: high engagement → fatigued
    const recentPost = {
      publishResults: [
        {
          platform: "TWITTER",
          status: "PUBLISHED",
          publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          insights: { likes: 1, comments: 0, shares: 0, reach: 5, impressions: 10 },
        },
      ],
    };
    const baselinePost1 = {
      publishResults: [
        {
          platform: "TWITTER",
          status: "PUBLISHED",
          publishedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          insights: { likes: 100, comments: 20, shares: 10, reach: 1000, impressions: 5000 },
        },
      ],
    };
    const baselinePost2 = {
      publishResults: [
        {
          platform: "TWITTER",
          status: "PUBLISHED",
          publishedAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000),
          insights: { likes: 90, comments: 18, shares: 9, reach: 900, impressions: 4500 },
        },
      ],
    };

    mockFindMany.mockResolvedValue([recentPost, baselinePost1, baselinePost2]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      overallFatigued: boolean;
      platforms: { platform: string; isFatigued: boolean }[];
    };
    expect(body.overallFatigued).toBe(true);
    const tw = body.platforms.find((p) => p.platform === "TWITTER")!;
    expect(tw.isFatigued).toBe(true);
  });
});
