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
  atomizeContent: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { create: jest.fn() },
    campaign: { create: jest.fn() },
    campaignPost: { create: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/atomize/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { atomizeContent } from "@/lib/ai";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockAtomizeContent = atomizeContent as jest.Mock;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const LONG_FORM_CONTENT = "a".repeat(200); // 200+ chars to pass validation

const MOCK_ATOMIZE_RESULT = {
  sourceTitle: "The Complete Guide to Social Media",
  summary: "A comprehensive overview of social media strategy for businesses.",
  posts: [
    {
      content: "Did you know 90% of businesses use social media? Here's why you need a strategy. #socialmedia #marketing",
      keyTakeaway: "Social media is essential for modern businesses",
      suggestedPlatforms: ["FACEBOOK", "LINKEDIN"],
    },
    {
      content: "The best time to post on Instagram is 9am on weekdays. Use this to maximize reach! #instagram #tips",
      keyTakeaway: "Timing matters for social media engagement",
      suggestedPlatforms: ["INSTAGRAM"],
    },
    {
      content: "Content calendar tip: Plan your posts 2 weeks ahead to stay consistent. #contentcalendar #socialmediatips",
      keyTakeaway: "Planning ahead leads to better consistency",
      suggestedPlatforms: ["FACEBOOK", "TWITTER", "LINKEDIN"],
    },
  ],
};

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/atomize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/atomize", () => {
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
      makeRequest({ content: LONG_FORM_CONTENT, platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(
      makeRequest({ content: LONG_FORM_CONTENT, platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(
      makeRequest({ content: LONG_FORM_CONTENT, platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const req = new NextRequest("http://localhost:3000/api/ai/atomize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is too short (< 100 chars)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(
      makeRequest({ content: "short content", platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when content exceeds 50000 chars", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(
      makeRequest({ content: "a".repeat(50001), platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(
      makeRequest({ content: LONG_FORM_CONTENT, platforms: [] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with atomized posts on success (no post creation)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockAtomizeContent.mockResolvedValueOnce(MOCK_ATOMIZE_RESULT);

    const res = await POST(
      makeRequest({
        content: LONG_FORM_CONTENT,
        platforms: ["FACEBOOK", "INSTAGRAM", "LINKEDIN"],
        targetPostCount: 7,
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof MOCK_ATOMIZE_RESULT;
    expect(data.posts).toHaveLength(3);
    expect(data.summary).toBe(MOCK_ATOMIZE_RESULT.summary);
    expect(data.sourceTitle).toBe(MOCK_ATOMIZE_RESULT.sourceTitle);
    expect(data.posts[0].content).toBeTruthy();
    expect(data.posts[0].keyTakeaway).toBeTruthy();
    expect(Array.isArray(data.posts[0].suggestedPlatforms)).toBe(true);
  });

  it("creates DRAFT posts with correct status when createPosts is true", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockAtomizeContent.mockResolvedValueOnce(MOCK_ATOMIZE_RESULT);

    const mockPost1 = { id: "post-id-1" };
    const mockPost2 = { id: "post-id-2" };
    const mockPost3 = { id: "post-id-3" };

    (mockPrisma.post.create as jest.Mock)
      .mockResolvedValueOnce(mockPost1)
      .mockResolvedValueOnce(mockPost2)
      .mockResolvedValueOnce(mockPost3);

    const res = await POST(
      makeRequest({
        content: LONG_FORM_CONTENT,
        platforms: ["FACEBOOK"],
        createPosts: true,
      })
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { createdPostIds: string[]; campaignId?: string };
    expect(data.createdPostIds).toHaveLength(3);
    expect(data.campaignId).toBeUndefined();
    expect(mockPrisma.post.create).toHaveBeenCalledTimes(3);

    // Verify posts are created as DRAFT
    const firstCall = (mockPrisma.post.create as jest.Mock).mock.calls[0][0];
    expect(firstCall.data.status).toBe("DRAFT");
    expect(firstCall.data.userId).toBe(MOCK_USER_ID);
  });

  it("creates campaign and CampaignPost links when campaignName is provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockAtomizeContent.mockResolvedValueOnce(MOCK_ATOMIZE_RESULT);

    const mockCampaign = { id: "campaign-id-1" };
    const mockPost = { id: "post-id-1" };

    (mockPrisma.campaign.create as jest.Mock).mockResolvedValueOnce(mockCampaign);
    (mockPrisma.post.create as jest.Mock).mockResolvedValue(mockPost);
    (mockPrisma.campaignPost.create as jest.Mock).mockResolvedValue({});

    const res = await POST(
      makeRequest({
        content: LONG_FORM_CONTENT,
        platforms: ["FACEBOOK"],
        createPosts: true,
        campaignName: "My Content Campaign",
      })
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      createdPostIds: string[];
      campaignId: string;
    };
    expect(data.campaignId).toBe("campaign-id-1");
    expect(mockPrisma.campaign.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "My Content Campaign" }),
      })
    );
    expect(mockPrisma.campaignPost.create).toHaveBeenCalledTimes(3);
  });

  it("returns 500 on AI service error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockAtomizeContent.mockRejectedValueOnce(new Error("Anthropic API unavailable"));

    const res = await POST(
      makeRequest({ content: LONG_FORM_CONTENT, platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(500);
  });
});
