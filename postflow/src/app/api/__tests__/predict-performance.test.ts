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
    postInsights: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ai", () => ({
  predictPostPerformance: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/predict-performance/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { predictPostPerformance } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindManyInsights = (prisma.postInsights.findMany as jest.Mock);
const mockPredict = predictPostPerformance as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

const SAMPLE_PREDICTION = {
  platform: "FACEBOOK",
  predictedEngagement: "HIGH" as const,
  confidence: 0.75,
  reasoning: "Strong hook and good length for the platform.",
  suggestedImprovements: [],
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/predict-performance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/predict-performance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    mockFindManyInsights.mockResolvedValue([]);
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ content: "Hello world post", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ content: "Hello world post", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ content: "Hello world post", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/predict-performance", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ content: "Hello world post", platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with predictions on success (no historical data)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindManyInsights.mockResolvedValueOnce([]);
    mockPredict.mockResolvedValueOnce([SAMPLE_PREDICTION]);

    const res = await POST(makeRequest({ content: "Hello world post content here", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { predictions: typeof SAMPLE_PREDICTION[] };
    expect(data.predictions).toHaveLength(1);
    expect(data.predictions[0].platform).toBe("FACEBOOK");
    expect(data.predictions[0].predictedEngagement).toBe("HIGH");
    expect(typeof data.predictions[0].confidence).toBe("number");
  });

  it("passes empty historical summary when no insights exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindManyInsights.mockResolvedValueOnce([]);
    mockPredict.mockResolvedValueOnce([SAMPLE_PREDICTION]);

    await POST(makeRequest({ content: "Test content post", platforms: ["FACEBOOK"] }));
    expect(mockPredict).toHaveBeenCalledWith(
      "Test content post",
      ["FACEBOOK"],
      ""
    );
  });

  it("builds historical summary from insight data", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindManyInsights.mockResolvedValueOnce([
      {
        impressions: 1000,
        likes: 50,
        comments: 10,
        shares: 5,
        syncedAt: new Date(),
        publishResult: { platform: "FACEBOOK" },
      },
      {
        impressions: 800,
        likes: 30,
        comments: 8,
        shares: 3,
        syncedAt: new Date(),
        publishResult: { platform: "FACEBOOK" },
      },
    ]);
    mockPredict.mockResolvedValueOnce([SAMPLE_PREDICTION]);

    await POST(makeRequest({ content: "Test content", platforms: ["FACEBOOK"] }));
    const historicalArg = (mockPredict.mock.calls[0] as unknown[])[2] as string;
    expect(historicalArg).toContain("FACEBOOK");
    expect(historicalArg).toContain("avg impressions=900");
  });

  it("returns 200 with multiple platform predictions", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindManyInsights.mockResolvedValueOnce([]);
    mockPredict.mockResolvedValueOnce([
      SAMPLE_PREDICTION,
      { ...SAMPLE_PREDICTION, platform: "INSTAGRAM", predictedEngagement: "MEDIUM" as const },
      { ...SAMPLE_PREDICTION, platform: "THREADS", predictedEngagement: "LOW" as const },
    ]);

    const res = await POST(makeRequest({ content: "Multi-platform post", platforms: ["FACEBOOK", "INSTAGRAM", "THREADS"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { predictions: typeof SAMPLE_PREDICTION[] };
    expect(data.predictions).toHaveLength(3);
  });

  it("returns 500 on AI service error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindManyInsights.mockResolvedValueOnce([]);
    mockPredict.mockRejectedValueOnce(new Error("AI service error"));

    const res = await POST(makeRequest({ content: "Hello world post", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
  });
});
