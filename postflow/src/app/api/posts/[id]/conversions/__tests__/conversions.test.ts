import { NextRequest } from "next/server";

jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

jest.mock("@prisma/client", () => ({
  ConversionType: {
    SALE: "SALE",
    LEAD: "LEAD",
    SIGNUP: "SIGNUP",
    DOWNLOAD: "DOWNLOAD",
    CLICK: "CLICK",
    OTHER: "OTHER",
  },
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
    },
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findFirst: jest.fn() },
    contentConversion: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { GET, POST } from "@/app/api/posts/[id]/conversions/route";
import { DELETE } from "@/app/api/posts/[id]/conversions/[conversionId]/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "user-1";
const MOCK_POST_ID = "post-1";
const MOCK_CONVERSION_ID = "conv-1";

const AUTHED = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

const MOCK_POST = { id: MOCK_POST_ID, userId: MOCK_USER_ID };
const MOCK_CONVERSION = {
  id: MOCK_CONVERSION_ID,
  userId: MOCK_USER_ID,
  postId: MOCK_POST_ID,
  type: "SALE",
  value: 99.99,
  currency: "USD",
  notes: "Test note",
  occurredAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/posts/" + MOCK_POST_ID + "/conversions");
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url.toString());
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/posts/" + MOCK_POST_ID + "/conversions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);
  (prisma.post.findFirst as jest.Mock).mockResolvedValue(MOCK_POST);
  (prisma.contentConversion.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.contentConversion.count as jest.Mock).mockResolvedValue(0);
  (prisma.contentConversion.create as jest.Mock).mockResolvedValue(MOCK_CONVERSION);
  (prisma.contentConversion.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.contentConversion.delete as jest.Mock).mockResolvedValue(MOCK_CONVERSION);
});

// ── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/posts/[id]/conversions", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: MOCK_POST_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: MOCK_POST_ID }) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when post not found", async () => {
    (prisma.post.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: MOCK_POST_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns empty conversions array when none exist", async () => {
    (prisma.contentConversion.findMany as jest.Mock).mockResolvedValue([]);
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: MOCK_POST_ID }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversions).toEqual([]);
  });

  it("returns conversions with correct shape", async () => {
    (prisma.contentConversion.findMany as jest.Mock).mockResolvedValue([MOCK_CONVERSION]);
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: MOCK_POST_ID }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversions).toHaveLength(1);
    expect(data.conversions[0]).toMatchObject({
      id: MOCK_CONVERSION_ID,
      type: "SALE",
      value: 99.99,
      currency: "USD",
    });
  });
});

// ── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/posts/[id]/conversions", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makePostRequest({ type: "SALE" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await POST(makePostRequest({ type: "SALE" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when post not found", async () => {
    (prisma.post.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await POST(makePostRequest({ type: "SALE" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 422 when conversion limit exceeded", async () => {
    (prisma.contentConversion.count as jest.Mock).mockResolvedValue(500);
    const res = await POST(makePostRequest({ type: "SALE" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 400 when body is invalid", async () => {
    const res = await POST(makePostRequest({ type: "INVALID_TYPE" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("creates and returns conversion with status 201", async () => {
    const res = await POST(makePostRequest({ type: "SALE", value: 99.99, notes: "Test" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.conversion).toMatchObject({
      id: MOCK_CONVERSION_ID,
      type: "SALE",
    });
    expect(prisma.contentConversion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "SALE", value: 99.99, userId: MOCK_USER_ID }),
      })
    );
  });
});

// ── DELETE ────────────────────────────────────────────────────────────────────

describe("DELETE /api/posts/[id]/conversions/[conversionId]", () => {
  const deleteReq = new NextRequest(
    "http://localhost/api/posts/" + MOCK_POST_ID + "/conversions/" + MOCK_CONVERSION_ID,
    { method: "DELETE" }
  );

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(deleteReq, {
      params: Promise.resolve({ id: MOCK_POST_ID, conversionId: MOCK_CONVERSION_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await DELETE(deleteReq, {
      params: Promise.resolve({ id: MOCK_POST_ID, conversionId: MOCK_CONVERSION_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when conversion not found", async () => {
    (prisma.contentConversion.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(deleteReq, {
      params: Promise.resolve({ id: MOCK_POST_ID, conversionId: MOCK_CONVERSION_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when conversion belongs to different user", async () => {
    // findFirst with userId filter will return null for wrong user
    (prisma.contentConversion.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(deleteReq, {
      params: Promise.resolve({ id: MOCK_POST_ID, conversionId: MOCK_CONVERSION_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("deletes conversion and returns 204", async () => {
    (prisma.contentConversion.findFirst as jest.Mock).mockResolvedValue(MOCK_CONVERSION);
    const res = await DELETE(deleteReq, {
      params: Promise.resolve({ id: MOCK_POST_ID, conversionId: MOCK_CONVERSION_ID }),
    });
    expect(res.status).toBe(204);
    expect(prisma.contentConversion.delete).toHaveBeenCalledWith({
      where: { id: MOCK_CONVERSION_ID },
    });
  });
});
