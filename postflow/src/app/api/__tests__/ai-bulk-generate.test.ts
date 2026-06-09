jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  MediaType: { NONE: "NONE" },
  PostStatus: { DRAFT: "DRAFT" },
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) { super(msg); this.code = opts.code; }
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
    post: { create: jest.fn() },
    campaign: { create: jest.fn() },
    campaignPost: { create: jest.fn() },
  },
}));

jest.mock("@/lib/ai", () => ({
  bulkGenerateContent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/bulk-generate/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { bulkGenerateContent } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockBulkGenerate = bulkGenerateContent as jest.Mock;
const mockPostCreate = prisma.post.create as jest.Mock;
const mockCampaignCreate = prisma.campaign.create as jest.Mock;
const mockCampaignPostCreate = prisma.campaignPost.create as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED = { user: { id: MOCK_USER_ID } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/bulk-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const MOCK_GENERATED = [
  { topic: "Topic 1", content: "Post content for topic 1 #hashtag", charCount: 35 },
  { topic: "Topic 2", content: "Post content for topic 2 #socialmedia", charCount: 38 },
];

describe("POST /api/ai/bulk-generate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ topics: ["Topic 1"], platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await POST(makeRequest({ topics: ["Topic 1"], platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await POST(makeRequest({ topics: ["Topic 1"], platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/bulk-generate", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 when topics array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await POST(makeRequest({ topics: [], platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when topics exceed 20 items", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const tooManyTopics = Array.from({ length: 21 }, (_, i) => `Topic ${i + 1}`);
    const res = await POST(makeRequest({ topics: tooManyTopics, platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await POST(makeRequest({ topics: ["Topic 1"], platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with generated content without creating posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockBulkGenerate.mockResolvedValueOnce(MOCK_GENERATED);

    const res = await POST(makeRequest({
      topics: ["Topic 1", "Topic 2"],
      platforms: ["FACEBOOK", "INSTAGRAM"],
    }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { generated: typeof MOCK_GENERATED };
    expect(Array.isArray(data.generated)).toBe(true);
    expect(data.generated).toHaveLength(2);
    expect(data.generated[0].topic).toBe("Topic 1");
    expect(data.generated[0].content).toContain("Post content for topic 1");
    // Should not create posts
    expect(mockPostCreate).not.toHaveBeenCalled();
  });

  it("creates DRAFT posts when createPosts is true", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockBulkGenerate.mockResolvedValueOnce(MOCK_GENERATED);
    mockPostCreate
      .mockResolvedValueOnce({ id: "post-1" })
      .mockResolvedValueOnce({ id: "post-2" });

    const res = await POST(makeRequest({
      topics: ["Topic 1", "Topic 2"],
      platforms: ["FACEBOOK"],
      createPosts: true,
    }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { generated: typeof MOCK_GENERATED; createdPostIds: string[] };
    expect(data.createdPostIds).toHaveLength(2);
    expect(mockPostCreate).toHaveBeenCalledTimes(2);
    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_USER_ID,
          status: "DRAFT",
          mediaType: "NONE",
        }),
      })
    );
  });

  it("creates campaign and CampaignPost links when campaignName is provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockBulkGenerate.mockResolvedValueOnce(MOCK_GENERATED);
    mockCampaignCreate.mockResolvedValueOnce({ id: "campaign-123" });
    mockPostCreate
      .mockResolvedValueOnce({ id: "post-1" })
      .mockResolvedValueOnce({ id: "post-2" });
    mockCampaignPostCreate.mockResolvedValue({});

    const res = await POST(makeRequest({
      topics: ["Topic 1", "Topic 2"],
      platforms: ["FACEBOOK"],
      createPosts: true,
      campaignName: "Summer Campaign",
    }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { createdPostIds: string[]; campaignId: string };
    expect(data.campaignId).toBe("campaign-123");
    expect(mockCampaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Summer Campaign",
          userId: MOCK_USER_ID,
        }),
      })
    );
    expect(mockCampaignPostCreate).toHaveBeenCalledTimes(2);
  });

  it("returns 500 on AI service error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockBulkGenerate.mockRejectedValueOnce(new Error("AI service error"));

    const res = await POST(makeRequest({ topics: ["Topic 1"], platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
  });
});
