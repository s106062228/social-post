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
  PublishStatus: {
    PUBLISHED: "PUBLISHED",
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
      findUnique: jest.fn(),
    },
    brandKit: {
      findUnique: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/posts/[id]/report-card/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockBrandKitFindUnique = prisma.brandKit.findUnique as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const MOCK_POST_NO_INSIGHTS = {
  id: MOCK_POST_ID,
  userId: MOCK_USER_ID,
  content: "This is a social media post about our product launch. Check it out! #launch #product",
  sentiment: null,
  publishResults: [],
};

const MOCK_POST_WITH_INSIGHTS = {
  id: MOCK_POST_ID,
  userId: MOCK_USER_ID,
  content: "Amazing post about our brand voice! Check this out today. #brand #content",
  sentiment: "POSITIVE",
  publishResults: [
    {
      id: "clresult001",
      platform: "FACEBOOK",
      publishedUrl: "https://facebook.com/post/123",
      insights: {
        impressions: 1000,
        reach: 800,
        likes: 50,
        comments: 10,
        shares: 5,
      },
    },
    {
      id: "clresult002",
      platform: "INSTAGRAM",
      publishedUrl: "https://instagram.com/p/abc",
      insights: {
        impressions: 500,
        reach: 400,
        likes: 30,
        comments: 5,
        shares: 2,
      },
    },
  ],
};

function makeRequest(postId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/report-card`, {
    method: "GET",
  });
}

const ROUTE_PARAMS = (id: string) => ({ params: Promise.resolve({ id }) });

type ReportCardResponse = {
  postId: string;
  content: string;
  overallGrade: string;
  overallScore: number;
  dimensions: { name: string; score: number; grade: string; details: string }[];
  totalEngagement: number;
  topPlatform: string | null;
  publishedPlatforms: string[];
  recommendations: string[];
};

describe("GET /api/posts/[id]/report-card", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
    mockBrandKitFindUnique.mockResolvedValue(null);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid post ID format", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await GET(makeRequest("not-a-cuid"), ROUTE_PARAMS("not-a-cuid"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 404 when post belongs to different user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      ...MOCK_POST_NO_INSIGHTS,
      userId: OTHER_USER_ID,
    });
    const res = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    expect(res.status).toBe(404);
  });

  it("returns grade with zero scores when post has no insights", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(MOCK_POST_NO_INSIGHTS);

    const res = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    expect(res.status).toBe(200);

    const data = (await res.json()) as ReportCardResponse;
    expect(data.postId).toBe(MOCK_POST_ID);
    expect(data.overallGrade).toMatch(/^[ABCDF]$/);
    expect(data.overallScore).toBeGreaterThanOrEqual(0);
    expect(data.overallScore).toBeLessThanOrEqual(100);
    expect(data.totalEngagement).toBe(0);
    expect(data.topPlatform).toBeNull();
    expect(data.publishedPlatforms).toEqual([]);
    // Engagement should be low when no insights (log-scale normalization means score ~10 for rawScore=0)
    const engagementDim = data.dimensions.find((d) => d.name === "Engagement");
    expect(engagementDim?.score).toBeLessThanOrEqual(15);
  });

  it("returns correct grade when post has insights", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(MOCK_POST_WITH_INSIGHTS);

    const res = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    expect(res.status).toBe(200);

    const data = (await res.json()) as ReportCardResponse;
    expect(data.postId).toBe(MOCK_POST_ID);
    expect(data.overallGrade).toMatch(/^[ABCDF]$/);
    expect(data.overallScore).toBeGreaterThan(0);
    expect(data.topPlatform).not.toBeNull();
    expect(data.publishedPlatforms).toContain("FACEBOOK");
    expect(data.publishedPlatforms).toContain("INSTAGRAM");
    expect(data.totalEngagement).toBeGreaterThan(0);
  });

  it("overall score is a weighted average within 0-100 range", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(MOCK_POST_WITH_INSIGHTS);

    const res = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    expect(res.status).toBe(200);

    const data = (await res.json()) as ReportCardResponse;
    expect(data.overallScore).toBeGreaterThanOrEqual(0);
    expect(data.overallScore).toBeLessThanOrEqual(100);
    expect(typeof data.overallScore).toBe("number");
  });

  it("recommendations are present and non-empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(MOCK_POST_NO_INSIGHTS);

    const res = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    expect(res.status).toBe(200);

    const data = (await res.json()) as ReportCardResponse;
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.recommendations.length).toBeGreaterThan(0);
    expect(typeof data.recommendations[0]).toBe("string");
  });

  it("dimensions array contains expected dimension names", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(MOCK_POST_NO_INSIGHTS);

    const res = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    expect(res.status).toBe(200);

    const data = (await res.json()) as ReportCardResponse;
    const dimNames = data.dimensions.map((d) => d.name);
    expect(dimNames).toContain("Engagement");
    expect(dimNames).toContain("SEO");
    expect(dimNames).toContain("Readability");
    expect(dimNames).toContain("Brand Compliance");
  });

  it("uses POSITIVE sentiment to improve score", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      ...MOCK_POST_NO_INSIGHTS,
      sentiment: "POSITIVE",
    });

    const resPositive = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    const dataPositive = (await resPositive.json()) as ReportCardResponse;

    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      ...MOCK_POST_NO_INSIGHTS,
      sentiment: "NEGATIVE",
    });

    const resNegative = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    const dataNegative = (await resNegative.json()) as ReportCardResponse;

    // POSITIVE should score higher than NEGATIVE
    expect(dataPositive.overallScore).toBeGreaterThan(dataNegative.overallScore);
  });

  it("compliance defaults to 100 when no brand kit configured", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(MOCK_POST_NO_INSIGHTS);
    mockBrandKitFindUnique.mockResolvedValueOnce(null);

    const res = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    expect(res.status).toBe(200);

    const data = (await res.json()) as ReportCardResponse;
    const complianceDim = data.dimensions.find((d) => d.name === "Brand Compliance");
    // With no brand kit, compliance defaults to 100
    expect(complianceDim?.score).toBe(100);
  });

  it("uses brand kit when present to compute compliance", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(MOCK_POST_NO_INSIGHTS);
    mockBrandKitFindUnique.mockResolvedValueOnce({
      doKeywords: ["required-keyword"],
      dontKeywords: ["forbidden-term"],
    });

    const res = await GET(makeRequest(MOCK_POST_ID), ROUTE_PARAMS(MOCK_POST_ID));
    expect(res.status).toBe(200);

    const data = (await res.json()) as ReportCardResponse;
    const complianceDim = data.dimensions.find((d) => d.name === "Brand Compliance");
    // Content doesn't have "required-keyword" so compliance should be < 100
    expect(complianceDim?.score).toBeLessThan(100);
  });
});
