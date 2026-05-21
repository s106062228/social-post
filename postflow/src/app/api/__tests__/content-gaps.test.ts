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
    post: { findMany: jest.fn() },
    brandKit: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/ai", () => ({
  suggestContentGaps: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/content-gaps/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { suggestContentGaps } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockBrandKitFindUnique = prisma.brandKit.findUnique as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockSuggestContentGaps = suggestContentGaps as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_SUGGESTIONS = [
  {
    topic: "Behind-the-Scenes",
    reason: "You haven't shared any BTS content yet",
    priority: "high" as const,
    contentIdea: "Show your workspace or creative process in a short video",
  },
  {
    topic: "Customer Success Stories",
    reason: "Social proof content drives conversions",
    priority: "high" as const,
    contentIdea: "Feature a client testimonial with before/after results",
  },
  {
    topic: "Industry News Commentary",
    reason: "Thought leadership builds authority",
    priority: "medium" as const,
    contentIdea: "Share your take on the latest industry development",
  },
];

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/ai/content-gaps", {
    method: "POST",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
  mockPostFindMany.mockResolvedValue([]);
  mockBrandKitFindUnique.mockResolvedValue(null);
  mockSuggestContentGaps.mockResolvedValue(MOCK_SUGGESTIONS);
});

afterAll(() => {
  process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
});

describe("POST /api/ai/content-gaps", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 200 with suggestions on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      suggestions: typeof MOCK_SUGGESTIONS;
      coveredTopicsCount: number;
    };
    expect(data.suggestions).toHaveLength(3);
    expect(data.suggestions[0].topic).toBe("Behind-the-Scenes");
    expect(data.suggestions[0].priority).toBe("high");
    expect(typeof data.suggestions[0].contentIdea).toBe("string");
    expect(typeof data.coveredTopicsCount).toBe("number");
  });

  it("returns empty suggestions array when AI returns nothing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockSuggestContentGaps.mockResolvedValueOnce([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { suggestions: unknown[] };
    expect(data.suggestions).toHaveLength(0);
  });

  it("returns coveredTopicsCount of 0 when no posts exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindMany.mockResolvedValueOnce([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { coveredTopicsCount: number };
    expect(data.coveredTopicsCount).toBe(0);
  });

  it("calls suggestContentGaps with extracted topics from posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindMany.mockResolvedValueOnce([
      {
        content: "productivity tips for remote workers using software tools",
        publishResults: [{ platform: "LINKEDIN" }],
      },
      {
        content: "software automation workflow productivity remote workers",
        publishResults: [{ platform: "TWITTER" }],
      },
    ]);
    await POST(makeRequest());
    expect(mockSuggestContentGaps).toHaveBeenCalledTimes(1);
    const [topics, platforms] = mockSuggestContentGaps.mock.calls[0] as [
      string[],
      string[],
      string | undefined,
    ];
    expect(Array.isArray(topics)).toBe(true);
    expect(topics.length).toBeGreaterThan(0);
    // "productivity" and "remote" and "workers" should be in topics
    expect(topics).toContain("productivity");
    expect(Array.isArray(platforms)).toBe(true);
    expect(platforms).toContain("LINKEDIN");
    expect(platforms).toContain("TWITTER");
  });

  it("passes brand kit context when brand kit exists", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockBrandKitFindUnique.mockResolvedValueOnce({
      tagline: "Grow faster with less effort",
      voiceGuide: "Professional yet approachable",
      doKeywords: ["growth", "efficiency"],
      dontKeywords: [],
    });
    await POST(makeRequest());
    const [, , brandKitContext] = mockSuggestContentGaps.mock.calls[0] as [
      string[],
      string[],
      string | undefined,
    ];
    expect(typeof brandKitContext).toBe("string");
    expect(brandKitContext).toContain("Grow faster");
  });

  it("passes undefined brand kit context when no brand kit", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockBrandKitFindUnique.mockResolvedValueOnce(null);
    await POST(makeRequest());
    const [, , brandKitContext] = mockSuggestContentGaps.mock.calls[0] as [
      string[],
      string[],
      string | undefined,
    ];
    expect(brandKitContext).toBeUndefined();
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindMany.mockRejectedValueOnce(new Error("DB connection failed"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
