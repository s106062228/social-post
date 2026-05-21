jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
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
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ai", () => ({
  analyzeTone: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/[id]/analyze-tone/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { analyzeTone } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.post.findUnique as jest.Mock;
const mockUpdate = prisma.post.update as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockAnalyzeTone = analyzeTone as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(postId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/analyze-tone`, {
    method: "POST",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});

afterAll(() => {
  process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
});

describe("POST /api/posts/[id]/analyze-tone", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI is not enabled", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not enabled/i);
  });

  it("returns 404 for invalid (non-CUID) post ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest("not-a-cuid"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: OTHER_USER_ID,
      content: "Hello world",
    });
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("analyzes tone and persists professional result", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "We are pleased to announce our Q3 earnings report.",
    });
    mockAnalyzeTone.mockResolvedValueOnce({
      tone: "professional",
      confidence: 0.92,
      traits: ["formal", "data-driven"],
    });
    mockUpdate.mockResolvedValueOnce({
      tone: "professional",
      toneTraits: ["formal", "data-driven"],
    });

    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tone: string; toneTraits: string[] };
    expect(data.tone).toBe("professional");
    expect(data.toneTraits).toEqual(["formal", "data-driven"]);
    expect(mockAnalyzeTone).toHaveBeenCalledWith(
      "We are pleased to announce our Q3 earnings report."
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: MOCK_POST_ID },
      data: { tone: "professional", toneTraits: ["formal", "data-driven"] },
      select: { tone: true, toneTraits: true },
    });
  });

  it("returns 500 on unexpected error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockRejectedValueOnce(new Error("DB error"));
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(500);
  });
});
