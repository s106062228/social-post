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
  generateCaptionsFromImageUrl: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/caption/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateCaptionsFromImageUrl } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateCaptions = generateCaptionsFromImageUrl as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;
const TEST_IMAGE_URL = "https://example.com/photo.jpg";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/caption", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/caption", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ imageUrl: TEST_IMAGE_URL, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ imageUrl: TEST_IMAGE_URL, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ imageUrl: TEST_IMAGE_URL, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("not configured");
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/caption", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when imageUrl is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when imageUrl is not a valid URL", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ imageUrl: "not-a-url", platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ imageUrl: TEST_IMAGE_URL, platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with captions for two platforms", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const captions = [
      { platform: "INSTAGRAM", content: "Beautiful photo! #nature #photography" },
      { platform: "TWITTER", content: "Amazing shot. #nature" },
    ];
    mockGenerateCaptions.mockResolvedValueOnce(captions);

    const res = await POST(makeRequest({ imageUrl: TEST_IMAGE_URL, platforms: ["INSTAGRAM", "TWITTER"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { captions: { platform: string; content: string }[] };
    expect(data.captions).toEqual(captions);
    expect(mockGenerateCaptions).toHaveBeenCalledWith(TEST_IMAGE_URL, ["INSTAGRAM", "TWITTER"]);
  });

  it("returns 500 on AI service error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateCaptions.mockRejectedValueOnce(new Error("Vision API error"));

    const res = await POST(makeRequest({ imageUrl: TEST_IMAGE_URL, platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
  });
});
