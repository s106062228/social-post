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

jest.mock("@/lib/ai", () => ({
  generateSocialBios: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/generate-bios/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateSocialBios } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateSocialBios = generateSocialBios as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_BIOS = [
  { platform: "TWITTER", bio: "Social media strategist helping brands grow 🚀", charCount: 50, charLimit: 160 },
  { platform: "INSTAGRAM", bio: "Helping brands tell their story. DM for collabs.", charCount: 48, charLimit: 150 },
];

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/generate-bios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/generate-bios", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(
      makeRequest({ name: "Jane", description: "Content creator", platforms: ["TWITTER"] })
    );
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(
      makeRequest({ name: "Jane", description: "Content creator", platforms: ["TWITTER"] })
    );
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(
      makeRequest({ name: "Jane", description: "Content creator", platforms: ["TWITTER"] })
    );
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai/generate-bios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(
      makeRequest({ description: "Content creator", platforms: ["TWITTER"] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(
      makeRequest({ name: "Jane", description: "Content creator", platforms: [] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with bios array for valid request", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateSocialBios.mockResolvedValueOnce(MOCK_BIOS);

    const res = await POST(
      makeRequest({
        name: "Jane Doe",
        description: "Social media strategist helping brands grow online",
        platforms: ["TWITTER", "INSTAGRAM"],
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { bios: typeof MOCK_BIOS };
    expect(Array.isArray(data.bios)).toBe(true);
    expect(data.bios).toHaveLength(2);
    expect(data.bios[0].platform).toBe("TWITTER");
    expect(typeof data.bios[0].bio).toBe("string");
    expect(typeof data.bios[0].charCount).toBe("number");
    expect(typeof data.bios[0].charLimit).toBe("number");
  });

  it("passes optional niche and keywords to AI function", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateSocialBios.mockResolvedValueOnce(MOCK_BIOS);

    await POST(
      makeRequest({
        name: "Jane",
        description: "Content creator",
        platforms: ["TWITTER"],
        niche: "Marketing",
        keywords: ["SEO", "growth"],
      })
    );

    const [, , , niche, keywords] = mockGenerateSocialBios.mock.calls[0] as [
      string,
      string,
      string[],
      string,
      string[],
    ];
    expect(niche).toBe("Marketing");
    expect(keywords).toEqual(["SEO", "growth"]);
  });

  it("returns 500 on AI service error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGenerateSocialBios.mockRejectedValueOnce(new Error("Anthropic API unavailable"));

    const res = await POST(
      makeRequest({
        name: "Jane",
        description: "Content creator",
        platforms: ["TWITTER"],
      })
    );
    expect(res.status).toBe(500);
  });
});
