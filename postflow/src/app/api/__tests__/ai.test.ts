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
  generateContentVariants: jest.fn(),
  suggestHashtags: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST as suggestPost } from "@/app/api/ai/suggest/route";
import { POST as hashtagsPost } from "@/app/api/ai/hashtags/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateContentVariants, suggestHashtags } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateVariants = generateContentVariants as jest.Mock;
const mockSuggestHashtags = suggestHashtags as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeSuggestRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeHashtagsRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/hashtags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── POST /api/ai/suggest ──────────────────────────────────────────────────────

describe("POST /api/ai/suggest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await suggestPost(makeSuggestRequest({ topic: "launch", tone: "casual", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await suggestPost(makeSuggestRequest({ topic: "launch", tone: "casual", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await suggestPost(makeSuggestRequest({ topic: "launch", tone: "casual", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/suggest", {
      method: "POST",
      body: "not-json",
    });
    const res = await suggestPost(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when topic is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await suggestPost(makeSuggestRequest({ tone: "casual", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await suggestPost(makeSuggestRequest({ topic: "launch", tone: "casual", platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await suggestPost(makeSuggestRequest({ topic: "launch", tone: "casual" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with variants on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const variants = ["Variant 1", "Variant 2", "Variant 3"];
    mockGenerateVariants.mockResolvedValueOnce(variants);

    const res = await suggestPost(makeSuggestRequest({ topic: "launch", tone: "casual", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { variants: string[] };
    expect(data.variants).toEqual(variants);
  });

  it("calls generateContentVariants with correct args", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateVariants.mockResolvedValueOnce(["v1", "v2", "v3"]);

    await suggestPost(makeSuggestRequest({ topic: "sale", tone: "enthusiastic", platforms: ["INSTAGRAM", "THREADS"] }));
    expect(mockGenerateVariants).toHaveBeenCalledWith("sale", "enthusiastic", ["INSTAGRAM", "THREADS"]);
  });

  it("uses default tone when tone is omitted", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateVariants.mockResolvedValueOnce(["v1", "v2", "v3"]);

    await suggestPost(makeSuggestRequest({ topic: "sale", platforms: ["FACEBOOK"] }));
    expect(mockGenerateVariants).toHaveBeenCalledWith("sale", "professional", ["FACEBOOK"]);
  });

  it("returns 500 on AI service error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateVariants.mockRejectedValueOnce(new Error("API error"));

    const res = await suggestPost(makeSuggestRequest({ topic: "launch", tone: "casual", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
  });
});

// ── POST /api/ai/hashtags ─────────────────────────────────────────────────────

describe("POST /api/ai/hashtags", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await hashtagsPost(makeHashtagsRequest({ content: "Hello world", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await hashtagsPost(makeHashtagsRequest({ content: "Hello world", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await hashtagsPost(makeHashtagsRequest({ content: "Hello world", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/hashtags", {
      method: "POST",
      body: "not-json",
    });
    const res = await hashtagsPost(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await hashtagsPost(makeHashtagsRequest({ platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await hashtagsPost(makeHashtagsRequest({ content: "Hello", platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with hashtags on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const hashtags = ["#marketing", "#brand", "#launch"];
    mockSuggestHashtags.mockResolvedValueOnce(hashtags);

    const res = await hashtagsPost(makeHashtagsRequest({ content: "New product launch", platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { hashtags: string[] };
    expect(data.hashtags).toEqual(hashtags);
  });

  it("calls suggestHashtags with correct args", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSuggestHashtags.mockResolvedValueOnce(["#test"]);

    await hashtagsPost(makeHashtagsRequest({ content: "My content", platforms: ["THREADS", "INSTAGRAM"] }));
    expect(mockSuggestHashtags).toHaveBeenCalledWith("My content", ["THREADS", "INSTAGRAM"]);
  });

  it("returns 500 on AI service error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSuggestHashtags.mockRejectedValueOnce(new Error("API error"));

    const res = await hashtagsPost(makeHashtagsRequest({ content: "Hello", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
  });
});
