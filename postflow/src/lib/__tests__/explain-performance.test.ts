import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findFirst: jest.fn() },
    postInsights: { aggregate: jest.fn() },
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock("@/lib/ai", () => ({
  explainPostPerformance: jest.fn(),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err: unknown) =>
    Response.json({ error: String(err) }, { status: 500 })
  ),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { explainPostPerformance } from "@/lib/ai";
import { POST } from "@/app/api/posts/[id]/explain-performance/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockRl = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockExplain = explainPostPerformance as jest.MockedFunction<typeof explainPostPerformance>;

const rlAllow = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const rlDeny = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

const mockInsightsResult = {
  explanation: "This post performed well due to its engaging content.",
  keyFactors: [
    { factor: "Content Length", impact: "positive" as const, description: "Optimal word count for the platform." },
    { factor: "Hashtags", impact: "positive" as const, description: "Well-targeted hashtags increased reach." },
  ],
  actionItems: ["Post at peak engagement hours", "Add a clear call-to-action"],
};

const VALID_POST_ID = "cldoqi4hq0000qzrm7x2e3h8y";

function makeRequest(postId: string = VALID_POST_ID) {
  return new NextRequest(`http://localhost/api/posts/${postId}/explain-performance`, {
    method: "POST",
  });
}

const mockPost = {
  id: "cldoqi4hq0000qzrm7x2e3h8y",
  content: "Test post content with some good engagement.",
  userId: "cldoqi4hq0000qzrm7x2e3h8z",
  status: "PUBLISHED",
  publishResults: [
    {
      id: "pr1",
      platform: "FACEBOOK",
      status: "PUBLISHED",
      insights: [
        {
          id: "ins1",
          impressions: 1000,
          reach: 800,
          likes: 50,
          comments: 10,
          shares: 5,
          syncedAt: new Date(),
        },
      ],
    },
  ],
};

const mockHistoricalAvg = {
  _avg: {
    impressions: 500,
    reach: 400,
    likes: 25,
    comments: 5,
    shares: 2,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.postInsights.aggregate as jest.Mock).mockResolvedValue(mockHistoricalAvg);
});

describe("POST /api/posts/[id]/explain-performance", () => {
  const validParams = Promise.resolve({ id: VALID_POST_ID });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(makeRequest(), { params: validParams });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlDeny);
    const res = await POST(makeRequest(), { params: validParams });
    expect(res.status).toBe(429);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    (prisma.post.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: validParams });
    expect(res.status).toBe(404);
  });

  it("returns 422 when post has no published insights", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    (prisma.post.findFirst as jest.Mock).mockResolvedValue({
      ...mockPost,
      publishResults: [{ id: "pr1", platform: "FACEBOOK", status: "PUBLISHED", insights: [] }],
    });
    const res = await POST(makeRequest(), { params: validParams });
    expect(res.status).toBe(422);
  });

  it("returns 503 when AI is not configured", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    (prisma.post.findFirst as jest.Mock).mockResolvedValue(mockPost);
    mockExplain.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: validParams });
    expect(res.status).toBe(503);
  });

  it("returns 200 on success", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    (prisma.post.findFirst as jest.Mock).mockResolvedValue(mockPost);
    mockExplain.mockResolvedValue(mockInsightsResult);
    const res = await POST(makeRequest(), { params: validParams });
    expect(res.status).toBe(200);
  });

  it("success response has explanation string", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    (prisma.post.findFirst as jest.Mock).mockResolvedValue(mockPost);
    mockExplain.mockResolvedValue(mockInsightsResult);
    const res = await POST(makeRequest(), { params: validParams });
    const data = (await res.json()) as { explanation: string };
    expect(typeof data.explanation).toBe("string");
    expect(data.explanation.length).toBeGreaterThan(0);
  });

  it("success response has keyFactors array with correct shape", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    (prisma.post.findFirst as jest.Mock).mockResolvedValue(mockPost);
    mockExplain.mockResolvedValue(mockInsightsResult);
    const res = await POST(makeRequest(), { params: validParams });
    const data = (await res.json()) as { keyFactors: { factor: string; impact: string; description: string }[] };
    expect(Array.isArray(data.keyFactors)).toBe(true);
    expect(data.keyFactors.length).toBeGreaterThan(0);
    const firstFactor = data.keyFactors[0];
    expect(typeof firstFactor.factor).toBe("string");
    expect(["positive", "negative", "neutral"]).toContain(firstFactor.impact);
    expect(typeof firstFactor.description).toBe("string");
  });

  it("success response has actionItems array", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    (prisma.post.findFirst as jest.Mock).mockResolvedValue(mockPost);
    mockExplain.mockResolvedValue(mockInsightsResult);
    const res = await POST(makeRequest(), { params: validParams });
    const data = (await res.json()) as { actionItems: string[] };
    expect(Array.isArray(data.actionItems)).toBe(true);
    expect(data.actionItems.every((item) => typeof item === "string")).toBe(true);
  });

  it("returns 500 on DB error", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    (prisma.post.findFirst as jest.Mock).mockRejectedValue(new Error("DB connection failed"));
    const res = await POST(makeRequest(), { params: validParams });
    expect(res.status).toBe(500);
  });

  it("passes aggregated insights to AI function", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    (prisma.post.findFirst as jest.Mock).mockResolvedValue(mockPost);
    mockExplain.mockResolvedValue(mockInsightsResult);
    await POST(makeRequest(), { params: validParams });
    expect(mockExplain).toHaveBeenCalledWith(
      mockPost.content,
      { impressions: 1000, reach: 800, likes: 50, comments: 10, shares: 5 },
      expect.any(Object),
      "FACEBOOK"
    );
  });
});
