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
  scheduleReminder: jest.fn().mockResolvedValue(undefined),
  cancelReminder: jest.fn().mockResolvedValue(true),
}));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/posts/[id]/reminder/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { scheduleReminder, cancelReminder } from "@/lib/queue/scheduler";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockPostUpdate = prisma.post.update as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockScheduleReminder = scheduleReminder as jest.Mock;
const mockCancelReminder = cancelReminder as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const FUTURE_DATE = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

function makeRequest(postId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/reminder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/posts/[id]/reminder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { reminderMinutes: 60 }), {
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

    const res = await PATCH(makeRequest(MOCK_POST_ID, { reminderMinutes: 60 }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 404 for invalid (non-CUID) post ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await PATCH(makeRequest("not-a-cuid", { reminderMinutes: 60 }), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when body is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const req = new NextRequest(`http://localhost:3000/api/posts/${MOCK_POST_ID}/reminder`, {
      method: "PATCH",
      body: "not-json",
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for reminderMinutes out of range (0)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { reminderMinutes: 0 }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 for reminderMinutes exceeding max (10081)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { reminderMinutes: 10081 }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
  });

  // ── Ownership ─────────────────────────────────────────────────────────────

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { reminderMinutes: 60 }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: OTHER_USER_ID,
      status: "SCHEDULED",
      scheduledAt: FUTURE_DATE,
    });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { reminderMinutes: 60 }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  // ── Set reminder on DRAFT post ────────────────────────────────────────────

  it("persists reminderMinutes on a DRAFT post without scheduling a BullMQ job", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      status: "DRAFT",
      scheduledAt: null,
    });
    mockPostUpdate.mockResolvedValueOnce({ reminderMinutes: 60 });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { reminderMinutes: 60 }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { reminderMinutes: number };
    expect(data.reminderMinutes).toBe(60);

    // No BullMQ job should be scheduled for a DRAFT
    expect(mockScheduleReminder).not.toHaveBeenCalled();
    expect(mockCancelReminder).not.toHaveBeenCalled();
  });

  // ── Set reminder on SCHEDULED post ───────────────────────────────────────

  it("persists reminderMinutes and schedules BullMQ job for a SCHEDULED post", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      status: "SCHEDULED",
      scheduledAt: FUTURE_DATE,
    });
    mockPostUpdate.mockResolvedValueOnce({ reminderMinutes: 60 });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { reminderMinutes: 60 }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { reminderMinutes: number };
    expect(data.reminderMinutes).toBe(60);

    expect(mockScheduleReminder).toHaveBeenCalledWith(
      MOCK_POST_ID,
      MOCK_USER_ID,
      FUTURE_DATE,
      60
    );
  });

  // ── Clear reminder ────────────────────────────────────────────────────────

  it("clears reminderMinutes (null) and cancels BullMQ job for a SCHEDULED post", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      status: "SCHEDULED",
      scheduledAt: FUTURE_DATE,
    });
    mockPostUpdate.mockResolvedValueOnce({ reminderMinutes: null });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { reminderMinutes: null }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { reminderMinutes: null };
    expect(data.reminderMinutes).toBeNull();

    expect(mockCancelReminder).toHaveBeenCalledWith(MOCK_POST_ID);
    expect(mockScheduleReminder).not.toHaveBeenCalled();
  });

  it("clears reminderMinutes (null) on a DRAFT post without touching BullMQ", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      status: "DRAFT",
      scheduledAt: null,
    });
    mockPostUpdate.mockResolvedValueOnce({ reminderMinutes: null });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { reminderMinutes: null }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });

    expect(res.status).toBe(200);
    expect(mockScheduleReminder).not.toHaveBeenCalled();
    expect(mockCancelReminder).not.toHaveBeenCalled();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await PATCH(makeRequest(MOCK_POST_ID, { reminderMinutes: 60 }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(500);
  });
});
