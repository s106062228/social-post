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
    socialComment: { findMany: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("@/lib/ai", () => ({
  analyzeCommentSentiment: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/inbox/comments/analyze/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { analyzeCommentSentiment } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.socialComment.findMany as jest.Mock;
const mockUpdate = prisma.socialComment.update as jest.Mock;
const mockAnalyze = analyzeCommentSentiment as jest.Mock;

const MOCK_USER_ID = "cltest000000000000000001";
const AUTHED = { user: { id: MOCK_USER_ID } };
const RL_OK = { success: true, limit: 10, remaining: 9, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 10, remaining: 0, resetAt: new Date() };

function makeRequest(body?: object): NextRequest {
  return new NextRequest("http://localhost/api/inbox/comments/analyze", {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);
  mockFindMany.mockResolvedValue([]);
  mockUpdate.mockResolvedValue({});
  // Mock ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("POST /api/inbox/comments/analyze", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_EXCEEDED);
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns analyzed counts when successful", async () => {
    mockFindMany.mockResolvedValue([
      { id: "c1", content: "Great post!" },
      { id: "c2", content: "Not good." },
    ]);
    mockAnalyze
      .mockResolvedValueOnce({ sentiment: "POSITIVE", score: 0.9 })
      .mockResolvedValueOnce({ sentiment: "NEGATIVE", score: 0.8 });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analyzed).toBe(2);
    expect(body.positive).toBe(1);
    expect(body.negative).toBe(1);
    expect(body.neutral).toBe(0);
  });

  it("skips comments when AI returns null", async () => {
    mockFindMany.mockResolvedValue([{ id: "c1", content: "hmm" }]);
    mockAnalyze.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    const body = await res.json();
    expect(body.analyzed).toBe(0);
  });

  it("analyzes specific comment when commentId provided", async () => {
    mockFindMany.mockResolvedValue([{ id: "specific-id", content: "test" }]);
    mockAnalyze.mockResolvedValue({ sentiment: "NEUTRAL", score: 0.7 });
    const res = await POST(makeRequest({ commentId: "specific-id" }));
    expect(res.status).toBe(200);
    // The where clause uses the commentId
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "specific-id" }),
      })
    );
  });

  it("updates DB with sentiment result", async () => {
    mockFindMany.mockResolvedValue([{ id: "c1", content: "Love it!" }]);
    mockAnalyze.mockResolvedValue({ sentiment: "POSITIVE", score: 0.95 });
    await POST(makeRequest({}));
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { sentiment: "POSITIVE", sentimentScore: 0.95 },
    });
  });
});
