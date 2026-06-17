import { NextRequest } from "next/server";

jest.mock("@/lib/ai", () => ({
  suggestOptimalPlatforms: jest.fn(),
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn().mockImplementation((err: unknown) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    postInsights: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { POST } from "@/app/api/ai/suggest-platforms/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { suggestOptimalPlatforms } from "@/lib/ai";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockApiLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockSuggestOptimalPlatforms = suggestOptimalPlatforms as jest.MockedFunction<typeof suggestOptimalPlatforms>;

const mockResult = {
  suggestions: [
    {
      platform: "INSTAGRAM",
      score: 85,
      reasoning: "Great for visual content and high engagement rates.",
      bestForAudience: "Millennials and Gen Z interested in lifestyle content",
      tips: ["Use high-quality images", "Add relevant hashtags", "Post at peak hours"],
    },
    {
      platform: "FACEBOOK",
      score: 72,
      reasoning: "Good reach with older demographics.",
      bestForAudience: "Adults 30-55 interested in community engagement",
      tips: ["Include a call to action", "Use native video for better reach"],
    },
  ],
  overallStrategy: "Focus on Instagram for primary distribution given the visual nature of your content, with Facebook as a secondary channel for broader reach.",
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/suggest-platforms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/suggest-platforms", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV, ANTHROPIC_API_KEY: "test-key" };
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as Awaited<ReturnType<typeof auth>>);
    mockApiLimiter.mockResolvedValue({ success: true } as Awaited<ReturnType<typeof apiLimiter>>);
    mockSuggestOptimalPlatforms.mockResolvedValue(mockResult);
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ content: "Hello world test post", mediaType: "NONE", platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false } as Awaited<ReturnType<typeof apiLimiter>>);
    const res = await POST(makeRequest({ content: "Hello world test post", mediaType: "NONE", platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({ content: "Hello world test post", mediaType: "NONE", platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(503);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("not configured");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/ai/suggest-platforms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is too short", async () => {
    const res = await POST(makeRequest({ content: "short", mediaType: "NONE", platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms is empty", async () => {
    const res = await POST(makeRequest({ content: "This is a long enough content string for testing", mediaType: "NONE", platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with suggestions and overallStrategy on success", async () => {
    const res = await POST(makeRequest({
      content: "Check out our amazing new product launch this season!",
      mediaType: "IMAGE",
      platforms: ["INSTAGRAM", "FACEBOOK"],
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof mockResult;
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(typeof data.overallStrategy).toBe("string");
  });

  it("returns suggestions with required fields", async () => {
    const res = await POST(makeRequest({
      content: "Check out our amazing new product launch this season!",
      mediaType: "IMAGE",
      platforms: ["INSTAGRAM", "FACEBOOK"],
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof mockResult;
    const suggestion = data.suggestions[0];
    expect(typeof suggestion.platform).toBe("string");
    expect(typeof suggestion.score).toBe("number");
    expect(typeof suggestion.reasoning).toBe("string");
    expect(typeof suggestion.bestForAudience).toBe("string");
    expect(Array.isArray(suggestion.tips)).toBe(true);
  });

  it("returns overallStrategy string in response", async () => {
    const res = await POST(makeRequest({
      content: "Exciting news about our upcoming event this weekend!",
      mediaType: "NONE",
      platforms: ["INSTAGRAM", "FACEBOOK", "TWITTER"],
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof mockResult;
    expect(data.overallStrategy).toBe(mockResult.overallStrategy);
    expect(data.overallStrategy.length).toBeGreaterThan(0);
  });

  it("returns 500 when AI returns null", async () => {
    mockSuggestOptimalPlatforms.mockResolvedValue(null);
    const res = await POST(makeRequest({
      content: "Check out our amazing new product launch this season!",
      mediaType: "IMAGE",
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when AI throws an unexpected error", async () => {
    mockSuggestOptimalPlatforms.mockRejectedValue(new Error("AI service unavailable"));
    const res = await POST(makeRequest({
      content: "Check out our amazing new product launch this season!",
      mediaType: "IMAGE",
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(500);
  });
});
