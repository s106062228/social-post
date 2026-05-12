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
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
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

jest.mock("@/lib/queue/scheduler", () => ({
  scheduleExpiry: jest.fn().mockResolvedValue(undefined),
  cancelExpiry: jest.fn().mockResolvedValue(true),
}));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/posts/[id]/expiry/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { scheduleExpiry, cancelExpiry } from "@/lib/queue/scheduler";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockPostUpdate = prisma.post.update as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockScheduleExpiry = scheduleExpiry as jest.Mock;
const mockCancelExpiry = cancelExpiry as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
const PAST_DATE = new Date(Date.now() - 60 * 1000); // 1 minute ago

function makeRequest(postId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/expiry`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/posts/[id]/expiry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { expiresAt: FUTURE_DATE.toISOString() }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { expiresAt: FUTURE_DATE.toISOString() }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 400 when body is invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const req = new NextRequest(`http://localhost:3000/api/posts/${MOCK_POST_ID}/expiry`, {
      method: "PATCH",
      body: "not-json",
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when expiresAt is not a valid datetime", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { expiresAt: "not-a-date" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 422 when expiresAt is in the past", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { expiresAt: PAST_DATE.toISOString() }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("future");
  });

  // ── Ownership ─────────────────────────────────────────────────────────────

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { expiresAt: FUTURE_DATE.toISOString() }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: OTHER_USER_ID,
    });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { expiresAt: FUTURE_DATE.toISOString() }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  // ── Set expiry ────────────────────────────────────────────────────────────

  it("sets expiresAt and schedules a BullMQ job", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
    });
    mockPostUpdate.mockResolvedValueOnce({ expiresAt: FUTURE_DATE });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { expiresAt: FUTURE_DATE.toISOString() }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { expiresAt: string };
    expect(data.expiresAt).toBeDefined();

    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_POST_ID },
        data: expect.objectContaining({ expiresAt: expect.any(Date) }),
      })
    );
    expect(mockScheduleExpiry).toHaveBeenCalledWith(
      MOCK_POST_ID,
      MOCK_USER_ID,
      expect.any(Date)
    );
    expect(mockCancelExpiry).not.toHaveBeenCalled();
  });

  // ── Clear expiry ──────────────────────────────────────────────────────────

  it("clears expiresAt (null) and cancels BullMQ job", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
    });
    mockPostUpdate.mockResolvedValueOnce({ expiresAt: null });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { expiresAt: null }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { expiresAt: null };
    expect(data.expiresAt).toBeNull();

    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { expiresAt: null },
      })
    );
    expect(mockCancelExpiry).toHaveBeenCalledWith(MOCK_POST_ID);
    expect(mockScheduleExpiry).not.toHaveBeenCalled();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await PATCH(makeRequest(MOCK_POST_ID, { expiresAt: FUTURE_DATE.toISOString() }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(500);
  });
});
