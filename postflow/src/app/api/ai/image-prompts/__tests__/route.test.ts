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
  generateImagePrompts: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/image-prompts/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateImagePrompts } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateImagePrompts = generateImagePrompts as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_PROMPTS = [
  {
    platform: "INSTAGRAM",
    prompt:
      "A stunning professional photo of a person using a laptop in a modern cozy cafe, warm lighting, bokeh background, photorealistic, high quality",
    negativePrompt: "blurry, distorted faces, low quality, watermark",
    aspectRatio: "1:1",
    style: "photorealistic",
    keyElements: ["person", "laptop", "cafe", "warm lighting"],
    colorPalette: ["#8B4513", "#F5DEB3", "#FFFFFF", "#4A4A4A"],
    mood: "professional",
  },
  {
    platform: "FACEBOOK",
    prompt:
      "Wide landscape shot of a professional workspace with natural light, productivity-focused composition, clean modern desk setup",
    negativePrompt: "cluttered, dark, low resolution",
    aspectRatio: "1.91:1",
    style: "photorealistic",
    keyElements: ["desk", "natural light", "workspace", "plants"],
    colorPalette: ["#F0F4F8", "#CBD5E0", "#4A5568", "#2D3748"],
    mood: "professional",
  },
];

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/image-prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_CONTENT =
  "Excited to share our new product launch! This changes everything about how we work from home. Check it out!";

describe("POST /api/ai/image-prompts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 400 when content is too short (under 10 chars)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ content: "short", platforms: ["INSTAGRAM"] }));
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
    const req = new NextRequest("http://localhost:3000/api/ai/image-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with prompts array on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateImagePrompts.mockResolvedValueOnce(MOCK_PROMPTS);

    const res = await POST(
      makeRequest({ content: VALID_CONTENT, platforms: ["INSTAGRAM", "FACEBOOK"] })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { prompts: typeof MOCK_PROMPTS };
    expect(Array.isArray(data.prompts)).toBe(true);
    expect(data.prompts).toHaveLength(2);
  });

  it("each prompt has required fields: platform, prompt, negativePrompt, aspectRatio, style, keyElements, colorPalette, mood", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateImagePrompts.mockResolvedValueOnce(MOCK_PROMPTS);

    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["INSTAGRAM"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { prompts: (typeof MOCK_PROMPTS)[0][] };
    const first = data.prompts[0];
    expect(typeof first.platform).toBe("string");
    expect(typeof first.prompt).toBe("string");
    expect(typeof first.negativePrompt).toBe("string");
    expect(typeof first.aspectRatio).toBe("string");
    expect(typeof first.style).toBe("string");
    expect(Array.isArray(first.keyElements)).toBe(true);
    expect(Array.isArray(first.colorPalette)).toBe(true);
    expect(typeof first.mood).toBe("string");
  });

  it("forwards style and mood optional params to generateImagePrompts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateImagePrompts.mockResolvedValueOnce(MOCK_PROMPTS);

    await POST(
      makeRequest({
        content: VALID_CONTENT,
        platforms: ["INSTAGRAM"],
        style: "digital illustration",
        mood: "playful and fun",
      })
    );

    expect(mockGenerateImagePrompts).toHaveBeenCalledWith(
      VALID_CONTENT,
      ["INSTAGRAM"],
      "digital illustration",
      "playful and fun"
    );
  });

  it("returns 500 when generateImagePrompts returns empty array", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateImagePrompts.mockResolvedValueOnce([]);

    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/failed to generate/i);
  });

  it("returns 500 on unexpected AI error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateImagePrompts.mockRejectedValueOnce(new Error("AI service unavailable"));

    const res = await POST(makeRequest({ content: VALID_CONTENT, platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
  });
});
