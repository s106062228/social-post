import { NextRequest } from "next/server";

jest.mock("@/lib/ai", () => ({
  generateGrowthStrategy: jest.fn(),
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
  db: {
    socialAccount: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    postInsights: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    post: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { POST } from "@/app/api/ai/growth-strategy/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateGrowthStrategy } from "@/lib/ai";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockApiLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockGenerateGrowthStrategy = generateGrowthStrategy as jest.MockedFunction<typeof generateGrowthStrategy>;

const mockStrategy = {
  weeks: [
    {
      week: 1,
      focus: "Content foundation",
      tactics: ["Post daily", "Engage with followers"],
      kpis: ["Reach 1000 impressions", "5% engagement rate"],
    },
  ],
  platformSpecific: [
    {
      platform: "INSTAGRAM",
      tips: ["Use reels for higher reach", "Post at 7pm"],
    },
  ],
  overallApproach: "Focus on consistent posting and audience engagement",
  estimatedGrowth: "15-25% follower growth over 30 days",
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/growth-strategy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/growth-strategy", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV, ANTHROPIC_API_KEY: "test-key" };
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as Awaited<ReturnType<typeof auth>>);
    mockApiLimiter.mockResolvedValue(null);
    mockGenerateGrowthStrategy.mockResolvedValue(mockStrategy);
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 })
    );
    const res = await POST(makeRequest({ platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI not configured", async () => {
    process.env = { ...OLD_ENV };
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({ platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/ai/growth-strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms is empty", async () => {
    const res = await POST(makeRequest({ platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns strategy and generatedAt on success", async () => {
    const res = await POST(makeRequest({ platforms: ["INSTAGRAM", "FACEBOOK"] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("strategy");
    expect(data).toHaveProperty("generatedAt");
    expect(typeof data.generatedAt).toBe("string");
  });

  it("strategy has weeks array", async () => {
    const res = await POST(makeRequest({ platforms: ["INSTAGRAM"] }));
    const data = await res.json();
    expect(Array.isArray(data.strategy.weeks)).toBe(true);
    expect(data.strategy.weeks[0]).toHaveProperty("week");
    expect(data.strategy.weeks[0]).toHaveProperty("focus");
    expect(Array.isArray(data.strategy.weeks[0].tactics)).toBe(true);
    expect(Array.isArray(data.strategy.weeks[0].kpis)).toBe(true);
  });

  it("strategy has platformSpecific tips", async () => {
    const res = await POST(makeRequest({ platforms: ["INSTAGRAM"] }));
    const data = await res.json();
    expect(Array.isArray(data.strategy.platformSpecific)).toBe(true);
    expect(data.strategy.platformSpecific[0]).toHaveProperty("platform");
    expect(Array.isArray(data.strategy.platformSpecific[0].tips)).toBe(true);
  });

  it("returns 500 on AI error", async () => {
    mockGenerateGrowthStrategy.mockRejectedValue(new Error("AI service failure"));
    const res = await POST(makeRequest({ platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(500);
  });
});
