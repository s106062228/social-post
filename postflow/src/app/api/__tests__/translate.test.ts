jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
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
    post: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/ai", () => ({
  translateContent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/[id]/translate/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { translateContent } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.post.findUnique as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockTranslate = translateContent as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(postId: string, body?: object): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? { targetLanguages: ["fr"] }),
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

describe("POST /api/posts/[id]/translate", () => {
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

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
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

  it("returns 400 when targetLanguages is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest(MOCK_POST_ID, { targetLanguages: [] }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/validation/i);
  });

  it("returns 400 when more than 5 languages requested", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(
      makeRequest(MOCK_POST_ID, { targetLanguages: ["fr", "es", "de", "ja", "ko", "it"] }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is missing targetLanguages", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest(MOCK_POST_ID, {}), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns translations for 2 target languages", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Hello, check out our new product!",
    });
    const mockTranslations = [
      { language: "fr", content: "Bonjour, découvrez notre nouveau produit !" },
      { language: "de", content: "Hallo, schauen Sie sich unser neues Produkt an!" },
    ];
    mockTranslate.mockResolvedValueOnce(mockTranslations);

    const res = await POST(
      makeRequest(MOCK_POST_ID, { targetLanguages: ["fr", "de"] }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { translations: { language: string; content: string }[] };
    expect(data.translations).toHaveLength(2);
    expect(data.translations[0].language).toBe("fr");
    expect(data.translations[1].language).toBe("de");
    expect(mockTranslate).toHaveBeenCalledWith(
      "Hello, check out our new product!",
      ["fr", "de"]
    );
  });

  it("returns 500 on AI error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Hello world",
    });
    mockTranslate.mockRejectedValueOnce(new Error("AI service error"));

    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(500);
  });
});
