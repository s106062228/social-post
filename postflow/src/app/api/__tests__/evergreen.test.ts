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
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/activity-log", () => ({ logActivity: jest.fn() }));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/posts/[id]/evergreen/route";
import { POST as recyclePost } from "@/app/api/posts/[id]/recycle/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.post.findUnique as jest.Mock;
const mockUpdate = prisma.post.update as jest.Mock;
const mockCreate = prisma.post.create as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

function makeRequest(postId: string, method = "PATCH", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/evergreen`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeRecycleRequest(postId: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/recycle`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
});

// ── PATCH /api/posts/[id]/evergreen ───────────────────────────────────────────

describe("PATCH /api/posts/[id]/evergreen", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await PATCH(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid (non-CUID) post ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await PATCH(makeRequest("not-a-cuid"), {
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
      isEvergreen: false,
    });
    const res = await PATCH(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("toggles isEvergreen from false to true", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      isEvergreen: false,
    });
    mockUpdate.mockResolvedValueOnce({ isEvergreen: true });

    const res = await PATCH(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isEvergreen: boolean };
    expect(data.isEvergreen).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: MOCK_POST_ID },
      data: { isEvergreen: true },
      select: { isEvergreen: true },
    });
  });

  it("toggles isEvergreen from true to false", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      isEvergreen: true,
    });
    mockUpdate.mockResolvedValueOnce({ isEvergreen: false });

    const res = await PATCH(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isEvergreen: boolean };
    expect(data.isEvergreen).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: MOCK_POST_ID },
      data: { isEvergreen: false },
      select: { isEvergreen: true },
    });
  });

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockRejectedValueOnce(new Error("DB connection lost"));
    const res = await PATCH(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(500);
  });
});

// ── POST /api/posts/[id]/recycle ──────────────────────────────────────────────

describe("POST /api/posts/[id]/recycle", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await recyclePost(makeRecycleRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await recyclePost(makeRecycleRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid (non-CUID) post ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await recyclePost(makeRecycleRequest("not-a-cuid"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: OTHER_USER_ID,
      content: "Hello",
      mediaType: "NONE",
      mediaUrls: [],
      status: "PUBLISHED",
    });
    const res = await recyclePost(makeRecycleRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when post is not PUBLISHED", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Hello",
      mediaType: "NONE",
      mediaUrls: [],
      status: "DRAFT",
    });
    const res = await recyclePost(makeRecycleRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/published/i);
  });

  it("creates a DRAFT copy with no body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const original = {
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Evergreen content",
      mediaType: "NONE",
      mediaUrls: [],
      status: "PUBLISHED",
    };
    mockFindUnique.mockResolvedValueOnce(original);
    const newPost = {
      id: "clh3ck8zp0003qr5hyvxckahk",
      content: "Evergreen content",
      mediaType: "NONE",
      mediaUrls: [],
      status: "DRAFT",
      scheduledAt: null,
      publishResults: [],
    };
    mockCreate.mockResolvedValueOnce(newPost);

    const res = await recyclePost(makeRecycleRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { status: string; scheduledAt: null };
    expect(data.status).toBe("DRAFT");
    expect(data.scheduledAt).toBeNull();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "Evergreen content",
          status: "DRAFT",
          scheduledAt: null,
        }),
      })
    );
  });

  it("creates a SCHEDULED copy when scheduledAt is provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const original = {
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Evergreen content",
      mediaType: "NONE",
      mediaUrls: [],
      status: "PUBLISHED",
    };
    mockFindUnique.mockResolvedValueOnce(original);
    const futureDate = "2026-06-01T10:00:00.000Z";
    const newPost = {
      id: "clh3ck8zp0004qr5hyvxckahk",
      content: "Evergreen content",
      mediaType: "NONE",
      mediaUrls: [],
      status: "SCHEDULED",
      scheduledAt: futureDate,
      publishResults: [],
    };
    mockCreate.mockResolvedValueOnce(newPost);

    const res = await recyclePost(makeRecycleRequest(MOCK_POST_ID, { scheduledAt: futureDate }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe("SCHEDULED");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SCHEDULED",
          scheduledAt: new Date(futureDate),
        }),
      })
    );
  });

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockRejectedValueOnce(new Error("DB connection lost"));
    const res = await recyclePost(makeRecycleRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(500);
  });
});
