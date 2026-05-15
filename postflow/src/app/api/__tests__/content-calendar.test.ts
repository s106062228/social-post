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

jest.mock("@/lib/db", () => ({
  prisma: {
    brandKit: { findUnique: jest.fn() },
    postInsights: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/ai", () => ({
  generateContentCalendar: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/content-calendar/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { generateContentCalendar } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockBrandKitFindUnique = prisma.brandKit.findUnique as jest.Mock;
const mockInsightsFindMany = prisma.postInsights.findMany as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateCalendar = generateContentCalendar as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

const VALID_BODY = {
  startDate: "2026-06-01",
  endDate: "2026-06-30",
  postsPerWeek: 3,
  platforms: ["INSTAGRAM", "FACEBOOK"],
};

const MOCK_DAYS = [
  {
    date: "2026-06-02",
    suggestions: [
      {
        platform: "INSTAGRAM",
        contentType: "IMAGE",
        draft: "Check out our latest product launch! 🚀",
        reasoning: "Tuesday mornings show peak Instagram engagement.",
      },
    ],
  },
  {
    date: "2026-06-04",
    suggestions: [
      {
        platform: "FACEBOOK",
        contentType: "TEXT",
        draft: "We're excited to share something special with our community!",
        reasoning: "Thursday afternoon is optimal for Facebook reach.",
      },
    ],
  },
];

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/content-calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/content-calendar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    mockBrandKitFindUnique.mockResolvedValue(null);
    mockInsightsFindMany.mockResolvedValue([]);
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("not configured");
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/content-calendar", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when startDate is after endDate", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(
      makeRequest({ ...VALID_BODY, startDate: "2026-07-01", endDate: "2026-06-01" })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("startDate");
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ ...VALID_BODY, platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with days from AI when no brand kit", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockBrandKitFindUnique.mockResolvedValueOnce(null);
    mockInsightsFindMany.mockResolvedValueOnce([]);
    mockGenerateCalendar.mockResolvedValueOnce(MOCK_DAYS);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { days: typeof MOCK_DAYS };
    expect(data.days).toEqual(MOCK_DAYS);
    expect(mockGenerateCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        postsPerWeek: 3,
        platforms: ["INSTAGRAM", "FACEBOOK"],
        brandContext: undefined,
        bestTimesContext: undefined,
      })
    );
  });

  it("includes brand context when brand kit exists", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockBrandKitFindUnique.mockResolvedValueOnce({
      tagline: "Innovate Daily",
      voiceGuide: "Professional but approachable",
      doKeywords: ["innovation", "growth"],
      dontKeywords: [],
    });
    mockInsightsFindMany.mockResolvedValueOnce([]);
    mockGenerateCalendar.mockResolvedValueOnce(MOCK_DAYS);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(mockGenerateCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        brandContext: expect.stringContaining("Innovate Daily"),
      })
    );
  });

  it("returns 500 on unexpected AI error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateCalendar.mockRejectedValueOnce(new Error("AI upstream error"));

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });
});
