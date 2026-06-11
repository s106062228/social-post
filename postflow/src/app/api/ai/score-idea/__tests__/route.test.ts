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
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
    TWITTER: "TWITTER",
    LINKEDIN: "LINKEDIN",
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/ai", () => ({
  scoreContentIdea: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    contentIdea: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/score-idea/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { scoreContentIdea } from "@/lib/ai";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockScoreIdea = scoreContentIdea as jest.Mock;
const mockPrisma = prisma as { contentIdea: { findMany: jest.Mock } };

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_SCORE = {
  overallScore: 78,
  dimensions: [
    { name: "Originality", score: 80, explanation: "Fresh angle on the topic" },
    { name: "Brand Fit", score: 75, explanation: "Aligns with brand voice" },
    { name: "Audience Interest", score: 85, explanation: "High relevance to target audience" },
    { name: "Timeliness", score: 70, explanation: "Relevant to current trends" },
    { name: "Estimated Engagement", score: 80, explanation: "Strong engagement potential" },
  ],
  topStrengths: ["Unique perspective", "Strong call-to-action potential"],
  topWeaknesses: ["May need more specificity", "Could be more timely"],
  recommendation: "pursue" as const,
};

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/score-idea", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/score-idea", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    mockPrisma.contentIdea.findMany.mockResolvedValue([]);
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ title: "my idea", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ title: "my idea", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ title: "my idea", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 400 when title is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ title: "my idea", platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/score-idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with score on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockScoreIdea.mockResolvedValueOnce(MOCK_SCORE);

    const res = await POST(
      makeRequest({
        title: "Summer product launch campaign",
        description: "Showcase our new features",
        platforms: ["FACEBOOK", "INSTAGRAM"],
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { score: typeof MOCK_SCORE };
    expect(data.score.overallScore).toBe(78);
    expect(data.score.recommendation).toBe("pursue");
  });

  it("returns scoring dimensions in response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockScoreIdea.mockResolvedValueOnce(MOCK_SCORE);

    const res = await POST(
      makeRequest({ title: "my idea", platforms: ["FACEBOOK"] })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { score: typeof MOCK_SCORE };
    expect(Array.isArray(data.score.dimensions)).toBe(true);
    expect(data.score.dimensions).toHaveLength(5);
    expect(data.score.dimensions[0]).toHaveProperty("name");
    expect(data.score.dimensions[0]).toHaveProperty("score");
    expect(data.score.dimensions[0]).toHaveProperty("explanation");
  });

  it("recommendation can be refine or skip", async () => {
    const refineScore = { ...MOCK_SCORE, overallScore: 55, recommendation: "refine" as const };
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockScoreIdea.mockResolvedValueOnce(refineScore);

    const res = await POST(makeRequest({ title: "borderline idea", platforms: ["THREADS"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { score: typeof refineScore };
    expect(data.score.recommendation).toBe("refine");
  });

  it("passes existing idea topics to scoreContentIdea", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrisma.contentIdea.findMany.mockResolvedValueOnce([
      { title: "Topic A" },
      { title: "Topic B" },
    ]);
    mockScoreIdea.mockResolvedValueOnce(MOCK_SCORE);

    await POST(makeRequest({ title: "new idea", platforms: ["FACEBOOK"] }));
    expect(mockScoreIdea).toHaveBeenCalledWith(
      "new idea",
      ["FACEBOOK"],
      undefined,
      ["Topic A", "Topic B"]
    );
  });

  it("returns 500 when AI returns null", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockScoreIdea.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ title: "my idea", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/scoring failed/i);
  });

  it("returns 500 on unexpected AI error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockScoreIdea.mockRejectedValueOnce(new Error("Network error"));

    const res = await POST(makeRequest({ title: "my idea", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
  });
});
