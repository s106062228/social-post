jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
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

jest.mock("@/lib/ai", () => ({
  discoverTrendingTopics: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findMany: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/trending-topics/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { discoverTrendingTopics } from "@/lib/ai";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockDiscover = discoverTrendingTopics as jest.Mock;
const mockDb = prisma as unknown as { post: { findMany: jest.Mock } };

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_TOPICS = [
  {
    topic: "AI fitness coaching",
    category: "Industry News",
    urgency: "now",
    reasoning: "AI tools for fitness are exploding in popularity.",
    contentIdea: "Share your experience with AI workout planners.",
    estimatedEngagement: "high",
  },
];

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/trending-topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/trending-topics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    (mockDb.post.findMany as jest.Mock).mockResolvedValue([]);
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/trending-topics", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty platforms", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when AI returns null", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockDiscover.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
  });

  it("returns topics and generalInsights on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockDiscover.mockResolvedValueOnce({
      topics: MOCK_TOPICS,
      generalInsights: "Great time for video content.",
    });
    const res = await POST(makeRequest({ platforms: ["FACEBOOK"], niche: "fitness" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      topics: typeof MOCK_TOPICS;
      generalInsights: string;
    };
    expect(data.topics).toHaveLength(1);
    expect(data.topics[0].topic).toBe("AI fitness coaching");
    expect(data.generalInsights).toBe("Great time for video content.");
  });

  it("passes niche and platforms to AI function", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockDiscover.mockResolvedValueOnce({ topics: [], generalInsights: "" });
    await POST(makeRequest({ platforms: ["INSTAGRAM", "TIKTOK"], niche: "cooking" }));
    expect(mockDiscover).toHaveBeenCalledWith(
      "cooking",
      expect.any(Array),
      ["INSTAGRAM", "TIKTOK"]
    );
  });

  it("passes existing topics from recent posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    (mockDb.post.findMany as jest.Mock).mockResolvedValueOnce([
      { content: "Best exercises for building muscle fast today" },
      { content: "10 healthy meal prep ideas for beginners" },
    ]);
    mockDiscover.mockResolvedValueOnce({ topics: [], generalInsights: "" });
    await POST(makeRequest({ platforms: ["FACEBOOK"] }));
    const existingTopics = mockDiscover.mock.calls[0][1] as string[];
    expect(existingTopics).toHaveLength(2);
    expect(existingTopics[0]).toContain("Best exercises");
  });

  it("all topic fields are present in response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockDiscover.mockResolvedValueOnce({
      topics: MOCK_TOPICS,
      generalInsights: "Insight text.",
    });
    const res = await POST(makeRequest({ platforms: ["FACEBOOK"] }));
    const data = (await res.json()) as { topics: typeof MOCK_TOPICS };
    const topic = data.topics[0];
    expect(topic).toHaveProperty("topic");
    expect(topic).toHaveProperty("category");
    expect(topic).toHaveProperty("urgency");
    expect(topic).toHaveProperty("reasoning");
    expect(topic).toHaveProperty("contentIdea");
    expect(topic).toHaveProperty("estimatedEngagement");
  });

  it("works without niche (defaults to empty string)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockDiscover.mockResolvedValueOnce({ topics: [], generalInsights: "" });
    const res = await POST(makeRequest({ platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(200);
    expect(mockDiscover).toHaveBeenCalledWith("", expect.any(Array), ["FACEBOOK"]);
  });
});
