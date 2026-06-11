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
    dailyBriefing: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    post: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    publishResult: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ai", () => ({
  generateDailyBriefing: jest.fn(),
}));

jest.mock("@/lib/hashtag-analytics", () => ({
  extractHashtags: jest.fn((content: string) => {
    const matches = content.match(/#\w+/g) ?? [];
    return matches.map((t: string) => t.toLowerCase());
  }),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/ai/daily-briefing/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { generateDailyBriefing } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateDailyBriefing = generateDailyBriefing as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_BRIEFING = {
  id: "br-1",
  userId: MOCK_USER_ID,
  date: "2026-06-11",
  todayScheduled: 2,
  weekScheduled: 8,
  yesterdayStats: { published: 3, totalEngagement: 150, topPlatform: "INSTAGRAM" },
  contentGaps: [],
  topHashtags: [{ tag: "#marketing", count: 5 }],
  summary: "Great day ahead!",
  recommendations: ["Post at 9 AM", "Use more hashtags", "Try Instagram Reels"],
  generatedAt: new Date("2026-06-11T08:00:00.000Z"),
};

const MOCK_AI_RESULT = {
  summary: "Your day looks productive!",
  recommendations: ["Schedule a post for Tuesday", "Try Instagram Reels", "Use more hashtags"],
};

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeGetRequest() {
  return new NextRequest("http://localhost:3000/api/ai/daily-briefing", { method: "GET" });
}

function makePostRequest() {
  return new NextRequest("http://localhost:3000/api/ai/daily-briefing", { method: "POST" });
}

describe("GET /api/ai/daily-briefing", () => {
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

  it("returns briefing when one exists", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    (prisma.dailyBriefing.findFirst as jest.Mock).mockResolvedValueOnce(MOCK_BRIEFING);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { briefing: typeof MOCK_BRIEFING };
    expect(data.briefing).toBeTruthy();
    expect(data.briefing.id).toBe("br-1");
    expect(data.briefing.summary).toBe("Great day ahead!");
    expect(data.briefing.recommendations).toHaveLength(3);
  });

  it("returns null briefing when none exists", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    (prisma.dailyBriefing.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { briefing: null };
    expect(data.briefing).toBeNull();
  });
});

describe("POST /api/ai/daily-briefing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    // Default DB mocks
    (prisma.post.count as jest.Mock).mockResolvedValue(3);
    (prisma.publishResult.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
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

  it("returns 503 when AI not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 500 when AI returns null", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateDailyBriefing.mockResolvedValueOnce(null);

    const res = await POST(makePostRequest());
    expect(res.status).toBe(500);
  });

  it("returns briefing on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateDailyBriefing.mockResolvedValueOnce(MOCK_AI_RESULT);
    (prisma.dailyBriefing.upsert as jest.Mock).mockResolvedValueOnce({
      ...MOCK_BRIEFING,
      summary: MOCK_AI_RESULT.summary,
      recommendations: MOCK_AI_RESULT.recommendations,
    });

    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { briefing: typeof MOCK_BRIEFING };
    expect(data.briefing).toBeTruthy();
    expect(data.briefing.summary).toBe("Your day looks productive!");
    expect(data.briefing.recommendations).toHaveLength(3);
  });

  it("includes yesterdayStats in AI call when insights exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const mockInsightResult = {
      postId: "post-1",
      platform: "INSTAGRAM",
      insights: { likes: 50, comments: 10, shares: 5, reach: 500, impressions: 1000 },
    };
    (prisma.publishResult.findMany as jest.Mock).mockResolvedValueOnce([mockInsightResult]);
    mockGenerateDailyBriefing.mockResolvedValueOnce(MOCK_AI_RESULT);
    (prisma.dailyBriefing.upsert as jest.Mock).mockResolvedValueOnce(MOCK_BRIEFING);

    await POST(makePostRequest());

    expect(mockGenerateDailyBriefing).toHaveBeenCalledWith(
      expect.objectContaining({
        yesterdayStats: expect.objectContaining({
          topPlatform: "INSTAGRAM",
          totalEngagement: 65, // 50+10+5
        }),
      })
    );
  });

  it("detects content gaps and passes them to AI", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    // Return no scheduled posts (so all 7 days are gaps)
    (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
    mockGenerateDailyBriefing.mockResolvedValueOnce(MOCK_AI_RESULT);
    (prisma.dailyBriefing.upsert as jest.Mock).mockResolvedValueOnce(MOCK_BRIEFING);

    await POST(makePostRequest());

    expect(mockGenerateDailyBriefing).toHaveBeenCalledWith(
      expect.objectContaining({
        contentGaps: expect.any(Array),
      })
    );
    const callArgs = mockGenerateDailyBriefing.mock.calls[0][0] as { contentGaps: string[] };
    // We cap at 5 gaps maximum
    expect(callArgs.contentGaps.length).toBeLessThanOrEqual(5);
  });

  it("upserts briefing keyed to today's date", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateDailyBriefing.mockResolvedValueOnce(MOCK_AI_RESULT);
    (prisma.dailyBriefing.upsert as jest.Mock).mockResolvedValueOnce(MOCK_BRIEFING);

    await POST(makePostRequest());

    const upsertCall = (prisma.dailyBriefing.upsert as jest.Mock).mock.calls[0][0] as {
      where: { userId_date: { userId: string; date: string } };
    };
    expect(upsertCall.where.userId_date.userId).toBe(MOCK_USER_ID);
    expect(upsertCall.where.userId_date.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns 500 on unexpected DB error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    (prisma.post.count as jest.Mock).mockRejectedValueOnce(new Error("DB connection failed"));

    const res = await POST(makePostRequest());
    expect(res.status).toBe(500);
  });
});
