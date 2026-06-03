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
  generateVideoScript: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/video-script/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateVideoScript } from "@/lib/ai";
import type { VideoScript } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateVideoScript = generateVideoScript as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

const MOCK_SCRIPT: VideoScript = {
  hook: "Did you know 90% of marketers get this wrong?",
  body: "Here are three proven strategies to grow your audience...",
  callToAction: "Follow for more tips and drop a comment below!",
  captions: [
    { platform: "INSTAGRAM", content: "3 strategies to grow your audience 🚀 #socialmedia" },
    { platform: "TIKTOK", content: "POV: You finally cracked the algorithm #viral" },
  ],
  estimatedDuration: 60,
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/video-script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/video-script", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ topic: "Test", duration: 60, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ topic: "Test", duration: 60, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ topic: "Test", duration: 60, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("not configured");
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/video-script", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 when topic is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ duration: 60, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when duration is out of range", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ topic: "Test", duration: 5, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when platforms is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ topic: "Test", duration: 60, platforms: [] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 200 with script on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateVideoScript.mockResolvedValueOnce(MOCK_SCRIPT);

    const res = await POST(makeRequest({ topic: "Grow your audience", duration: 60, platforms: ["INSTAGRAM", "TIKTOK"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { script: VideoScript };
    expect(data.script.hook).toBe(MOCK_SCRIPT.hook);
    expect(data.script.body).toBe(MOCK_SCRIPT.body);
    expect(data.script.callToAction).toBe(MOCK_SCRIPT.callToAction);
    expect(data.script.captions).toHaveLength(2);
    expect(data.script.estimatedDuration).toBe(60);
    expect(mockGenerateVideoScript).toHaveBeenCalledWith(
      "Grow your audience",
      60,
      ["INSTAGRAM", "TIKTOK"],
      undefined
    );
  });

  it("returns 500 on AI service error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateVideoScript.mockRejectedValueOnce(new Error("AI service unavailable"));

    const res = await POST(makeRequest({ topic: "Test", duration: 60, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(500);
  });
});
