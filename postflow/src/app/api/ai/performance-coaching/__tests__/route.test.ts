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
    coachingInsight: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    publishResult: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    postingGoal: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ai", () => ({
  generatePerformanceCoaching: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/ai/performance-coaching/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { generatePerformanceCoaching } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateCoaching = generatePerformanceCoaching as jest.Mock;
const mockFindFirst = prisma.coachingInsight.findFirst as jest.Mock;
const mockCreate = prisma.coachingInsight.create as jest.Mock;
const mockPublishResultFindMany = prisma.publishResult.findMany as jest.Mock;
const mockPublishResultCount = prisma.publishResult.count as jest.Mock;
const mockPostingGoalFindMany = prisma.postingGoal.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_COACHING = {
  id: "coaching-1",
  userId: MOCK_USER_ID,
  weekOf: new Date("2026-07-06T00:00:00.000Z"),
  summary: "Great week overall! You published consistently.",
  highlights: ["Published 5 posts", "Instagram engagement up 20%"],
  improvements: ["Try posting earlier in the day", "Add more hashtags"],
  nextWeekFocus: "Focus on video content for higher engagement",
  overallScore: 75,
  createdAt: new Date("2026-07-07T01:00:00.000Z"),
};

const MOCK_AI_RESULT = {
  summary: MOCK_COACHING.summary,
  highlights: MOCK_COACHING.highlights,
  improvements: MOCK_COACHING.improvements,
  nextWeekFocus: MOCK_COACHING.nextWeekFocus,
  overallScore: MOCK_COACHING.overallScore,
};

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeGetRequest() {
  return new NextRequest("http://localhost:3000/api/ai/performance-coaching", {
    method: "GET",
  });
}

function makePostRequest() {
  return new NextRequest("http://localhost:3000/api/ai/performance-coaching", {
    method: "POST",
  });
}

describe("GET /api/ai/performance-coaching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it("returns null coaching when none exists", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValueOnce(null);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { coaching: null };
    expect(data.coaching).toBeNull();
  });

  it("returns most recent coaching insight", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValueOnce(MOCK_COACHING);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { coaching: typeof MOCK_COACHING };
    expect(data.coaching).toBeTruthy();
    expect(data.coaching.overallScore).toBe(75);
    expect(data.coaching.highlights).toHaveLength(2);
    expect(data.coaching.improvements).toHaveLength(2);
    expect(typeof data.coaching.nextWeekFocus).toBe("string");
    expect(typeof data.coaching.summary).toBe("string");
  });
});

describe("POST /api/ai/performance-coaching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 200 with coaching on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    mockPublishResultFindMany.mockResolvedValueOnce([
      {
        postId: "post-1",
        platform: "FACEBOOK",
        post: { content: "Hello world" },
        insights: { likes: 10, comments: 5, shares: 2, reach: 500, impressions: 1000 },
      },
    ]);
    mockPostingGoalFindMany.mockResolvedValueOnce([]);
    mockPublishResultCount.mockResolvedValue(0);
    mockGenerateCoaching.mockResolvedValueOnce(MOCK_AI_RESULT);
    mockCreate.mockResolvedValueOnce(MOCK_COACHING);

    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { coaching: typeof MOCK_COACHING; weekOf: string };
    expect(data.coaching).toBeTruthy();
    expect(data.coaching.overallScore).toBe(75);
    expect(typeof data.weekOf).toBe("string");
  });

  it("stores coaching insight in database", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    mockPublishResultFindMany.mockResolvedValueOnce([]);
    mockPostingGoalFindMany.mockResolvedValueOnce([]);
    mockGenerateCoaching.mockResolvedValueOnce(MOCK_AI_RESULT);
    mockCreate.mockResolvedValueOnce(MOCK_COACHING);

    await POST(makePostRequest());

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_USER_ID,
          summary: MOCK_AI_RESULT.summary,
          highlights: MOCK_AI_RESULT.highlights,
          improvements: MOCK_AI_RESULT.improvements,
          nextWeekFocus: MOCK_AI_RESULT.nextWeekFocus,
          overallScore: MOCK_AI_RESULT.overallScore,
        }),
      })
    );
  });

  it("returns 503 when AI generation returns null", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    mockPublishResultFindMany.mockResolvedValueOnce([]);
    mockPostingGoalFindMany.mockResolvedValueOnce([]);
    mockGenerateCoaching.mockResolvedValueOnce(null);

    const res = await POST(makePostRequest());
    expect(res.status).toBe(503);
  });

  it("returns 500 on unexpected error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    mockPublishResultFindMany.mockRejectedValueOnce(new Error("DB error"));

    const res = await POST(makePostRequest());
    expect(res.status).toBe(500);
  });
});
