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
  },
}));

jest.mock("@/lib/ai", () => ({
  optimizePost: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/optimize/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { optimizePost } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockBrandKitFindUnique = prisma.brandKit.findUnique as jest.Mock;
const mockOptimizePost = optimizePost as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_RESULT = {
  optimizedContent: "Exciting news! 🚀 We're launching a brand new feature. #innovation #launch #tech",
  changes: [
    { type: "engagement", description: "Added emoji for visual appeal" },
    { type: "hashtags", description: "Added relevant industry hashtags" },
    { type: "clarity", description: "Improved sentence structure" },
  ],
  hashtagsAdded: ["#innovation", "#launch", "#tech"],
  estimatedImprovementScore: 72,
};

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/optimize", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    mockBrandKitFindUnique.mockResolvedValue(null);
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ content: "Hello world", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ content: "Hello world", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ content: "Hello world", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
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
    const res = await POST(makeRequest({ content: "Hello world", platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with optimization result including changes array", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockOptimizePost.mockResolvedValueOnce(MOCK_RESULT);

    const res = await POST(
      makeRequest({ content: "we are launching a new feature", platforms: ["FACEBOOK", "TWITTER"] })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof MOCK_RESULT;
    expect(typeof data.optimizedContent).toBe("string");
    expect(Array.isArray(data.changes)).toBe(true);
    expect(Array.isArray(data.hashtagsAdded)).toBe(true);
    expect(typeof data.estimatedImprovementScore).toBe("number");
    expect(data.changes).toHaveLength(3);
    expect(data.hashtagsAdded).toHaveLength(3);
    expect(data.estimatedImprovementScore).toBe(72);
  });

  it("includes brand context when brand kit exists", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockBrandKitFindUnique.mockResolvedValueOnce({
      voiceGuide: "Friendly and approachable",
      tagline: "Grow Faster",
      doKeywords: ["growth", "success"],
      dontKeywords: ["cheap", "free"],
    });
    mockOptimizePost.mockResolvedValueOnce(MOCK_RESULT);

    await POST(makeRequest({ content: "check out our product", platforms: ["LINKEDIN"] }));

    const [, , brandKitContext] = mockOptimizePost.mock.calls[0] as [
      string,
      string[],
      string | null,
      string | null,
    ];
    expect(typeof brandKitContext).toBe("string");
    expect(brandKitContext).toContain("Grow Faster");
    expect(brandKitContext).toContain("Friendly and approachable");
  });

  it("passes null brand context when no brand kit exists", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockBrandKitFindUnique.mockResolvedValueOnce(null);
    mockOptimizePost.mockResolvedValueOnce(MOCK_RESULT);

    await POST(makeRequest({ content: "hello world", platforms: ["INSTAGRAM"] }));

    const [, , brandKitContext] = mockOptimizePost.mock.calls[0] as [
      string,
      string[],
      string | null,
      string | null,
    ];
    expect(brandKitContext).toBeNull();
  });

  it("returns 500 on AI service error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockOptimizePost.mockRejectedValueOnce(new Error("Anthropic API unavailable"));

    const res = await POST(makeRequest({ content: "Hello world", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
  });
});
