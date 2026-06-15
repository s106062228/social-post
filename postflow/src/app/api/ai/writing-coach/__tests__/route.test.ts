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

jest.mock("@/lib/ai", () => ({
  getWritingCoachFeedback: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/writing-coach/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { getWritingCoachFeedback } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGetWritingCoachFeedback = getWritingCoachFeedback as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_FEEDBACK = {
  score: 72,
  summary: "Good content with clear message. Some areas for improvement.",
  improvements: [
    {
      category: "engagement",
      suggestion: "Add a question at the end to encourage comments.",
      impact: "high",
    },
    {
      category: "cta",
      suggestion: "Include a clear call-to-action to direct readers.",
      impact: "medium",
    },
    {
      category: "clarity",
      suggestion: "Shorten sentences for better readability.",
      impact: "low",
    },
  ],
};

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/writing-coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_CONTENT =
  "Today I want to share some important insights I have learned about building a successful social media presence over the past few years of working with brands.";

describe("POST /api/ai/writing-coach", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 400 when content is too short (under 20 chars)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ content: "short", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/writing-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with correct shape on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetWritingCoachFeedback.mockResolvedValueOnce(MOCK_FEEDBACK);

    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["FACEBOOK", "INSTAGRAM"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof MOCK_FEEDBACK;
    expect(typeof data.score).toBe("number");
    expect(typeof data.summary).toBe("string");
    expect(Array.isArray(data.improvements)).toBe(true);
  });

  it("each improvement has category, suggestion, and impact fields", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetWritingCoachFeedback.mockResolvedValueOnce(MOCK_FEEDBACK);

    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["LINKEDIN"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof MOCK_FEEDBACK;
    const first = data.improvements[0];
    expect(first).toHaveProperty("category");
    expect(first).toHaveProperty("suggestion");
    expect(first).toHaveProperty("impact");
    expect(typeof first.suggestion).toBe("string");
  });

  it("improvement category is one of the valid values", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetWritingCoachFeedback.mockResolvedValueOnce(MOCK_FEEDBACK);

    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["TWITTER"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof MOCK_FEEDBACK;
    const validCategories = ["clarity", "engagement", "platform", "tone", "cta"];
    data.improvements.forEach((imp) => {
      expect(validCategories).toContain(imp.category);
    });
  });

  it("improvement impact is one of the valid values", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetWritingCoachFeedback.mockResolvedValueOnce(MOCK_FEEDBACK);

    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof MOCK_FEEDBACK;
    const validImpacts = ["high", "medium", "low"];
    data.improvements.forEach((imp) => {
      expect(validImpacts).toContain(imp.impact);
    });
  });

  it("returns 500 when AI returns null", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetWritingCoachFeedback.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
  });

  it("returns 500 on unexpected AI error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetWritingCoachFeedback.mockRejectedValueOnce(new Error("Unexpected AI error"));

    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
  });
});
