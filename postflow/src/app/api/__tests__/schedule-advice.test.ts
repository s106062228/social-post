jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
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

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findMany: jest.fn() },
    postInsights: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/ai", () => ({
  generateScheduleAdvice: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/schedule-advice/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { generateScheduleAdvice } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockInsightsFindMany = prisma.postInsights.findMany as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateAdvice = generateScheduleAdvice as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

const MOCK_RECOMMENDATIONS = [
  { insight: "You post most on weekdays", action: "Schedule weekend posts to fill gaps", priority: "high" as const },
  { insight: "Instagram engagement is highest at 18:00", action: "Schedule IG posts for early evening", priority: "medium" as const },
  { insight: "You have 3 drafts not yet scheduled", action: "Schedule your drafts this week", priority: "low" as const },
];

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/ai/schedule-advice", {
    method: "POST",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  mockPostFindMany.mockResolvedValue([]);
  mockInsightsFindMany.mockResolvedValue([]);
});

afterAll(() => {
  process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
});

describe("POST /api/ai/schedule-advice", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns recommendations on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockGenerateAdvice.mockResolvedValueOnce(MOCK_RECOMMENDATIONS);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { recommendations: typeof MOCK_RECOMMENDATIONS };
    expect(data.recommendations).toHaveLength(3);
    expect(data.recommendations[0].priority).toBe("high");
    expect(data.recommendations[0].insight).toBe("You post most on weekdays");
  });

  it("calls generateScheduleAdvice with history and insights summaries", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindMany.mockResolvedValueOnce([
      {
        createdAt: new Date(),
        status: "PUBLISHED",
        scheduledAt: new Date(),
        publishResults: [
          { platform: "FACEBOOK", status: "PUBLISHED", publishedAt: new Date("2025-01-01T09:00:00Z") },
        ],
      },
    ]);
    mockInsightsFindMany.mockResolvedValueOnce([
      {
        impressions: 100,
        reach: 80,
        likes: 10,
        comments: 2,
        shares: 1,
        publishResult: { platform: "FACEBOOK", publishedAt: new Date() },
      },
    ]);
    mockGenerateAdvice.mockResolvedValueOnce(MOCK_RECOMMENDATIONS);

    await POST(makeRequest());

    expect(mockGenerateAdvice).toHaveBeenCalledTimes(1);
    const [historySummary, insightsSummary] = mockGenerateAdvice.mock.calls[0] as [string, string];
    expect(historySummary).toContain("1 posts created");
    expect(historySummary).toContain("FACEBOOK");
    expect(insightsSummary).toContain("FACEBOOK");
    expect(insightsSummary).toContain("avg 13 engagements/post");
  });

  it("returns empty recommendations array when AI returns nothing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockGenerateAdvice.mockResolvedValueOnce([]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { recommendations: unknown[] };
    expect(data.recommendations).toHaveLength(0);
  });

  it("handles empty history gracefully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindMany.mockResolvedValueOnce([]);
    mockInsightsFindMany.mockResolvedValueOnce([]);
    mockGenerateAdvice.mockResolvedValueOnce(MOCK_RECOMMENDATIONS);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const [historySummary, insightsSummary] = mockGenerateAdvice.mock.calls[0] as [string, string];
    expect(historySummary).toContain("0 posts created");
    expect(insightsSummary).toContain("No engagement data available yet");
  });

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindMany.mockRejectedValueOnce(new Error("DB error"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
