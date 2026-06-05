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
  MediaType: { NONE: "NONE" },
  PostStatus: { DRAFT: "DRAFT" },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/ai", () => ({
  generateContentSeries: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { create: jest.fn() },
    campaign: { create: jest.fn() },
    campaignPost: { create: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/content-series/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateContentSeries } from "@/lib/ai";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateSeries = generateContentSeries as jest.Mock;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_SERIES = {
  seriesTitle: "5-Part Guide to Social Media Growth",
  description: "A comprehensive series on growing your social presence",
  posts: [
    {
      postNumber: 1,
      title: "Why Social Media Matters",
      content: "Social media is the future of marketing. Here's why you need to start now...",
      hookLine: "Is your brand invisible online?",
      schedulingTip: "Post on Monday morning for maximum reach",
      keyTakeaway: "Social media drives business growth",
    },
    {
      postNumber: 2,
      title: "Choosing Your Platforms",
      content: "Not all platforms are equal. Focus on where your audience lives...",
      hookLine: "Are you wasting time on the wrong platform?",
      schedulingTip: "Post mid-week for high engagement",
      keyTakeaway: "Platform selection is crucial",
    },
  ],
};

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/content-series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/content-series", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(
      makeRequest({ topic: "social media growth", postCount: 5, platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(
      makeRequest({ topic: "social media growth", postCount: 5, platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(
      makeRequest({ topic: "social media growth", postCount: 5, platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 400 when topic is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ postCount: 5, platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when postCount is out of range", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(
      makeRequest({ topic: "growth", postCount: 1, platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(400);

    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res2 = await POST(
      makeRequest({ topic: "growth", postCount: 11, platforms: ["FACEBOOK"] })
    );
    expect(res2.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ topic: "growth", postCount: 5, platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with series on success (no post creation)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateSeries.mockResolvedValueOnce(MOCK_SERIES);

    const res = await POST(
      makeRequest({
        topic: "social media growth",
        postCount: 5,
        platforms: ["FACEBOOK", "INSTAGRAM"],
        tone: "professional",
        seriesType: "educational",
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { series: typeof MOCK_SERIES };
    expect(data.series).toEqual(MOCK_SERIES);
    expect(data.series.seriesTitle).toBe(MOCK_SERIES.seriesTitle);
    expect(Array.isArray(data.series.posts)).toBe(true);
    expect(data.series.posts).toHaveLength(2);
  });

  it("calls generateContentSeries with correct args", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateSeries.mockResolvedValueOnce(MOCK_SERIES);

    await POST(
      makeRequest({
        topic: "content marketing",
        postCount: 3,
        platforms: ["TWITTER", "LINKEDIN"],
        tone: "casual",
        seriesType: "tips",
      })
    );

    expect(mockGenerateSeries).toHaveBeenCalledWith(
      "content marketing",
      3,
      ["TWITTER", "LINKEDIN"],
      "casual",
      "tips"
    );
  });

  it("creates DRAFT posts and campaign when createPosts and campaignName are provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateSeries.mockResolvedValueOnce(MOCK_SERIES);

    const mockCampaign = { id: "campaign-id-1" };
    const mockPost1 = { id: "post-id-1" };
    const mockPost2 = { id: "post-id-2" };

    (mockPrisma.campaign.create as jest.Mock).mockResolvedValueOnce(mockCampaign);
    (mockPrisma.post.create as jest.Mock)
      .mockResolvedValueOnce(mockPost1)
      .mockResolvedValueOnce(mockPost2);
    (mockPrisma.campaignPost.create as jest.Mock).mockResolvedValue({});

    const res = await POST(
      makeRequest({
        topic: "social media growth",
        postCount: 5,
        platforms: ["FACEBOOK"],
        createPosts: true,
        campaignName: "My Growth Series",
      })
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      series: typeof MOCK_SERIES;
      createdPostIds: string[];
      campaignId: string;
    };
    expect(data.createdPostIds).toHaveLength(2);
    expect(data.campaignId).toBe("campaign-id-1");
    expect(mockPrisma.campaign.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.post.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.campaignPost.create).toHaveBeenCalledTimes(2);
  });

  it("creates DRAFT posts without campaign when createPosts is true but no campaignName", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateSeries.mockResolvedValueOnce(MOCK_SERIES);

    const mockPost1 = { id: "post-id-1" };
    const mockPost2 = { id: "post-id-2" };

    (mockPrisma.post.create as jest.Mock)
      .mockResolvedValueOnce(mockPost1)
      .mockResolvedValueOnce(mockPost2);

    const res = await POST(
      makeRequest({
        topic: "social media growth",
        postCount: 5,
        platforms: ["FACEBOOK"],
        createPosts: true,
      })
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      series: typeof MOCK_SERIES;
      createdPostIds: string[];
      campaignId?: string;
    };
    expect(data.createdPostIds).toHaveLength(2);
    expect(data.campaignId).toBeUndefined();
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it("returns 500 on AI service error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateSeries.mockRejectedValueOnce(new Error("Anthropic API unavailable"));

    const res = await POST(
      makeRequest({ topic: "social media growth", postCount: 5, platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(500);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const req = new NextRequest("http://localhost:3000/api/ai/content-series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
