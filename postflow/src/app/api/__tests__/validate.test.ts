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
    },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/[id]/validate/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.post.findUnique as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

function makeRequest(postId: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
});

describe("POST /api/posts/[id]/validate", () => {
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
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: OTHER_USER_ID,
      content: "Hello!",
      mediaType: "NONE",
    });
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns validation results for all platforms when no platforms specified", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Great post!",
      mediaType: "NONE",
    });
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { platform: string; valid: boolean; errors: string[]; warnings: string[] }[] };
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeGreaterThan(0);
    for (const r of data.results) {
      expect(r).toHaveProperty("platform");
      expect(r).toHaveProperty("valid");
      expect(r).toHaveProperty("errors");
      expect(r).toHaveProperty("warnings");
    }
  });

  it("returns validation results only for specified platforms", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Hello world",
      mediaType: "NONE",
    });
    const res = await POST(
      makeRequest(MOCK_POST_ID, { platforms: ["FACEBOOK", "TWITTER"] }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { platform: string }[] };
    expect(data.results).toHaveLength(2);
    expect(data.results.map((r) => r.platform)).toEqual(
      expect.arrayContaining(["FACEBOOK", "TWITTER"])
    );
  });

  it("filters out invalid platform values", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Hello world",
      mediaType: "NONE",
    });
    const res = await POST(
      makeRequest(MOCK_POST_ID, { platforms: ["FACEBOOK", "BOGUS"] }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { platform: string }[] };
    expect(data.results.every((r) => r.platform !== "BOGUS")).toBe(true);
    expect(data.results.some((r) => r.platform === "FACEBOOK")).toBe(true);
  });

  it("returns 400 when only invalid platforms provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Hello world",
      mediaType: "NONE",
    });
    const res = await POST(
      makeRequest(MOCK_POST_ID, { platforms: ["BOGUS", "FAKE"] }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns errors for content that exceeds Twitter limit", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const longContent = "A".repeat(300);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: longContent,
      mediaType: "NONE",
    });
    const res = await POST(
      makeRequest(MOCK_POST_ID, { platforms: ["TWITTER"] }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { platform: string; valid: boolean; errors: string[] }[] };
    const twitterResult = data.results.find((r) => r.platform === "TWITTER");
    expect(twitterResult?.valid).toBe(false);
    expect(twitterResult?.errors.length).toBeGreaterThan(0);
  });

  it("returns errors for YOUTUBE with mediaType NONE", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "No video here",
      mediaType: "NONE",
    });
    const res = await POST(
      makeRequest(MOCK_POST_ID, { platforms: ["YOUTUBE"] }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { platform: string; valid: boolean }[] };
    expect(data.results[0].valid).toBe(false);
  });

  it("returns valid:true for short content on FACEBOOK", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Hello, world!",
      mediaType: "NONE",
    });
    const res = await POST(
      makeRequest(MOCK_POST_ID, { platforms: ["FACEBOOK"] }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { platform: string; valid: boolean }[] };
    expect(data.results[0].valid).toBe(true);
  });

  it("works with empty body (falls back to all platforms)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Hello!",
      mediaType: "NONE",
    });
    const req = new NextRequest(`http://localhost:3000/api/posts/${MOCK_POST_ID}/validate`, {
      method: "POST",
    });
    const res = await POST(req, {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: unknown[] };
    expect(data.results.length).toBeGreaterThan(0);
  });

  it("returns 500 on unexpected DB error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockRejectedValueOnce(new Error("DB error"));
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(500);
  });
});
