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
  generateHooks: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/generate-hooks/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateHooks } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateHooks = generateHooks as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_HOOKS = [
  { hook: "What if everything you know about social media is wrong?", style: "question", explanation: "Opens with a provocative question" },
  { hook: "87% of marketers fail at this one thing.", style: "statistic", explanation: "Uses a surprising statistic" },
  { hook: "I almost gave up on my business last year.", style: "story", explanation: "Personal narrative opener" },
  { hook: "Here's the brutal truth nobody tells you.", style: "controversy", explanation: "Bold statement hook" },
  { hook: "There's a secret formula the top creators use.", style: "curiosity", explanation: "Creates an information gap" },
];

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/generate-hooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/generate-hooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ content: "This is some post content for testing", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ content: "This is some post content for testing", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ content: "This is some post content for testing", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 400 when content is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is too short (under 10 chars)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ content: "short", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ content: "This is some post content for testing", platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/generate-hooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with hooks array on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateHooks.mockResolvedValueOnce(MOCK_HOOKS);

    const res = await POST(
      makeRequest({
        content: "Today I want to share some important lessons I've learned about building a successful social media presence.",
        platforms: ["FACEBOOK", "INSTAGRAM"],
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { hooks: typeof MOCK_HOOKS };
    expect(Array.isArray(data.hooks)).toBe(true);
    expect(data.hooks).toHaveLength(5);
  });

  it("respects the count parameter", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateHooks.mockResolvedValueOnce(MOCK_HOOKS.slice(0, 3));

    const res = await POST(
      makeRequest({
        content: "Today I want to share some important lessons about social media strategy.",
        platforms: ["TWITTER"],
        count: 3,
      })
    );
    expect(res.status).toBe(200);
    expect(mockGenerateHooks).toHaveBeenCalledWith(
      expect.stringContaining("Today I want to share"),
      ["TWITTER"],
      3
    );
  });

  it("each hook has the expected shape with hook, style, and explanation", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateHooks.mockResolvedValueOnce(MOCK_HOOKS);

    const res = await POST(
      makeRequest({
        content: "This post is about how to grow your brand on social media effectively.",
        platforms: ["LINKEDIN"],
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { hooks: typeof MOCK_HOOKS };
    const first = data.hooks[0];
    expect(first).toHaveProperty("hook");
    expect(first).toHaveProperty("style");
    expect(first).toHaveProperty("explanation");
    expect(typeof first.hook).toBe("string");
    expect(typeof first.style).toBe("string");
    expect(typeof first.explanation).toBe("string");
  });

  it("hook style is one of the valid values", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateHooks.mockResolvedValueOnce(MOCK_HOOKS);

    const res = await POST(
      makeRequest({
        content: "Learn how to write engaging social media content that converts followers into customers.",
        platforms: ["FACEBOOK"],
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { hooks: typeof MOCK_HOOKS };
    const validStyles = ["question", "statistic", "story", "controversy", "curiosity", "list"];
    data.hooks.forEach((h) => {
      expect(validStyles).toContain(h.style);
    });
  });

  it("returns 500 on unexpected AI error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateHooks.mockRejectedValueOnce(new Error("Unexpected error"));

    const res = await POST(
      makeRequest({
        content: "This is some content that is long enough to pass validation checks.",
        platforms: ["FACEBOOK"],
      })
    );
    expect(res.status).toBe(500);
  });
});
