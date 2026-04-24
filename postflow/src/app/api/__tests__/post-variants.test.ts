jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
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

jest.mock("@/lib/sanitize", () => ({
  sanitizePostContent: (s: string) => s,
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findUnique: jest.fn() },
    postVariant: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { GET, PUT } from "@/app/api/posts/[id]/variants/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockVariantFindMany = prisma.postVariant.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_VARIANT = {
  id: "clh3ck8zp0002qr5hyvxckahk",
  platform: "FACEBOOK",
  content: "Facebook-specific content",
  mediaType: "NONE",
  mediaUrls: [],
  createdAt: new Date("2026-04-24T10:00:00Z"),
  updatedAt: new Date("2026-04-24T10:00:00Z"),
};

function makeGetRequest(postId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/variants`, {
    method: "GET",
  });
}

function makePutRequest(postId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/variants`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── GET /api/posts/[id]/variants ───────────────────────────────────────────────

describe("GET /api/posts/[id]/variants", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid cuid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await GET(makeGetRequest("not-a-cuid"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns variants list for owned post", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockVariantFindMany.mockResolvedValueOnce([MOCK_VARIANT]);
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { variants: unknown[] };
    expect(data.variants).toHaveLength(1);
    expect(mockVariantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: VALID_POST_ID } })
    );
  });

  it("returns empty array when no variants exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockVariantFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { variants: unknown[] };
    expect(data.variants).toHaveLength(0);
  });
});

// ── PUT /api/posts/[id]/variants ───────────────────────────────────────────────

describe("PUT /api/posts/[id]/variants", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await PUT(makePutRequest(VALID_POST_ID, { variants: [] }), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await PUT(makePutRequest(VALID_POST_ID, { variants: [] }), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid cuid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await PUT(makePutRequest("not-a-cuid", { variants: [] }), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(null);
    const res = await PUT(makePutRequest(VALID_POST_ID, { variants: [] }), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    const res = await PUT(makePutRequest(VALID_POST_ID, { variants: [] }), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    const req = new NextRequest(
      `http://localhost:3000/api/posts/${VALID_POST_ID}/variants`,
      { method: "PUT", body: "not-json", headers: { "Content-Type": "application/json" } }
    );
    const res = await PUT(req, { params: Promise.resolve({ id: VALID_POST_ID }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing variants field", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    const res = await PUT(makePutRequest(VALID_POST_ID, {}), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for duplicate platforms in variants", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    const res = await PUT(
      makePutRequest(VALID_POST_ID, {
        variants: [
          { platform: "FACEBOOK", content: "FB 1", mediaType: "NONE", mediaUrls: [] },
          { platform: "FACEBOOK", content: "FB 2", mediaType: "NONE", mediaUrls: [] },
        ],
      }),
      { params: Promise.resolve({ id: VALID_POST_ID }) }
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/duplicate/i);
  });

  it("clears all variants when empty array is sent", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        postVariant: {
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
          createManyAndReturn: jest.fn(),
        },
      };
      return fn(tx);
    });
    const res = await PUT(makePutRequest(VALID_POST_ID, { variants: [] }), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { variants: unknown[] };
    expect(data.variants).toHaveLength(0);
  });

  it("saves variants and returns them", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });

    const savedVariants = [
      { ...MOCK_VARIANT, platform: "FACEBOOK", content: "FB content" },
      { ...MOCK_VARIANT, id: "clh3ck8zp0003qr5hyvxckahk", platform: "INSTAGRAM", content: "IG content" },
    ];

    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        postVariant: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          createManyAndReturn: jest.fn().mockResolvedValue(savedVariants),
        },
      };
      return fn(tx);
    });

    const res = await PUT(
      makePutRequest(VALID_POST_ID, {
        variants: [
          { platform: "FACEBOOK", content: "FB content", mediaType: "NONE", mediaUrls: [] },
          { platform: "INSTAGRAM", content: "IG content", mediaType: "NONE", mediaUrls: [] },
        ],
      }),
      { params: Promise.resolve({ id: VALID_POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { variants: unknown[] };
    expect(data.variants).toHaveLength(2);
  });
});
