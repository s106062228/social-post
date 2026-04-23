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

jest.mock("@/lib/activity-log", () => ({ logActivity: jest.fn() }));

const mockPostFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();
const mockPostUpdate = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findUnique: (...args: unknown[]) => mockPostFindUnique(...args),
      update: (...args: unknown[]) => mockPostUpdate(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

// Mock findNextAvailableSlot
const mockFindNextSlot = jest.fn();
jest.mock("@/lib/queue-slots", () => ({
  findNextAvailableSlot: (...args: unknown[]) => mockFindNextSlot(...args),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/[id]/queue/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const NEXT_SLOT = new Date("2026-05-01T09:00:00.000Z");

function makeRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${id}/queue`, { method: "POST" });
}

async function callPost(id: string) {
  return POST(makeRequest(id), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
  mockUserFindUnique.mockResolvedValue({ timezone: "UTC" });
  mockFindNextSlot.mockResolvedValue(NEXT_SLOT);
});

describe("POST /api/posts/[id]/queue", () => {
  // ── Auth ────────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await callPost(POST_ID);
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limit ──────────────────────────────────────────────────────────────

  it("returns 429 when rate-limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await callPost(POST_ID);
    expect(res.status).toBe(429);
  });

  // ── Not found / ownership ───────────────────────────────────────────────────

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(null);
    const res = await callPost(POST_ID);
    expect(res.status).toBe(404);
  });

  it("returns 403 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: "other", status: "DRAFT" });
    const res = await callPost(POST_ID);
    expect(res.status).toBe(403);
  });

  // ── Status conflict ─────────────────────────────────────────────────────────

  it("returns 409 when post is not DRAFT", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, status: "SCHEDULED" });
    const res = await callPost(POST_ID);
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/DRAFT/);
  });

  // ── No available slot ───────────────────────────────────────────────────────

  it("returns 422 when no queue slot is available", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, status: "DRAFT" });
    mockFindNextSlot.mockResolvedValueOnce(null);
    const res = await callPost(POST_ID);
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/No available queue slots/);
  });

  // ── Success ─────────────────────────────────────────────────────────────────

  it("schedules post to next available slot", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, status: "DRAFT" });
    mockPostUpdate.mockResolvedValueOnce({
      id: POST_ID,
      status: "SCHEDULED",
      scheduledAt: NEXT_SLOT,
    });

    const res = await callPost(POST_ID);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; scheduledAt: string };
    expect(data.status).toBe("SCHEDULED");
    expect(new Date(data.scheduledAt).getTime()).toBe(NEXT_SLOT.getTime());
  });

  it("calls findNextAvailableSlot with user timezone", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, status: "DRAFT" });
    mockUserFindUnique.mockResolvedValueOnce({ timezone: "America/New_York" });
    mockPostUpdate.mockResolvedValueOnce({ id: POST_ID, status: "SCHEDULED", scheduledAt: NEXT_SLOT });

    await callPost(POST_ID);
    expect(mockFindNextSlot).toHaveBeenCalledWith(MOCK_USER_ID, "America/New_York");
  });

  it("updates post with SCHEDULED status and correct scheduledAt", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, status: "DRAFT" });
    mockPostUpdate.mockResolvedValueOnce({ id: POST_ID, status: "SCHEDULED", scheduledAt: NEXT_SLOT });

    await callPost(POST_ID);
    expect(mockPostUpdate).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: { scheduledAt: NEXT_SLOT, status: "SCHEDULED" },
      select: { id: true, status: true, scheduledAt: true },
    });
  });

  // ── Error ───────────────────────────────────────────────────────────────────

  it("returns 500 on unexpected db error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockRejectedValueOnce(new Error("DB connection lost"));
    const res = await callPost(POST_ID);
    expect(res.status).toBe(500);
  });
});
