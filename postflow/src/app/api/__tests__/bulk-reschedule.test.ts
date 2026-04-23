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

const mockFindMany = jest.fn();
const mockUpdate = jest.fn();
const mockTransaction = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/posts/bulk-reschedule/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const ID_1 = "clh3ck8zp0001qr5hyvxckahk";
const ID_2 = "clh3ck8zp0002qr5hyvxckahk";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/posts/bulk-reschedule", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/posts/bulk-reschedule", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
    mockTransaction.mockImplementation(async (arr: unknown[]) => arr);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest({ ids: [ID_1], shiftMinutes: 30 }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await PATCH(makeRequest({ ids: [ID_1], shiftMinutes: 30 }));
    expect(res.status).toBe(429);
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const req = new NextRequest("http://localhost:3000/api/posts/bulk-reschedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 when ids is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await PATCH(makeRequest({ shiftMinutes: 30 }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when ids is empty array", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await PATCH(makeRequest({ ids: [], shiftMinutes: 30 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids exceeds 100 items", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const ids = Array.from({ length: 101 }, (_, i) =>
      `clh3ck8zp${String(i).padStart(4, "0")}qr5hyvxckahk`
    );
    const res = await PATCH(makeRequest({ ids, shiftMinutes: 30 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when shiftMinutes is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await PATCH(makeRequest({ ids: [ID_1] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when shiftMinutes is not an integer", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await PATCH(makeRequest({ ids: [ID_1], shiftMinutes: 1.5 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when shiftMinutes exceeds bounds", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await PATCH(makeRequest({ ids: [ID_1], shiftMinutes: 999999 }));
    expect(res.status).toBe(400);
  });

  it("accepts negative shiftMinutes (shift backward)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([
      { id: ID_1, scheduledAt: new Date("2025-06-01T12:00:00Z") },
    ]);
    const res = await PATCH(makeRequest({ ids: [ID_1], shiftMinutes: -60 }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { rescheduled: number };
    expect(data.rescheduled).toBe(1);
  });

  // ── Successful reschedule ─────────────────────────────────────────────────

  it("returns 200 with rescheduled count on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([
      { id: ID_1, scheduledAt: new Date("2025-06-01T10:00:00Z") },
      { id: ID_2, scheduledAt: new Date("2025-06-02T10:00:00Z") },
    ]);

    const res = await PATCH(makeRequest({ ids: [ID_1, ID_2], shiftMinutes: 30 }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { rescheduled: number };
    expect(data.rescheduled).toBe(2);
  });

  it("queries only SCHEDULED posts owned by the user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([
      { id: ID_1, scheduledAt: new Date("2025-06-01T10:00:00Z") },
    ]);

    await PATCH(makeRequest({ ids: [ID_1], shiftMinutes: 60 }));

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: [ID_1] },
        userId: MOCK_USER_ID,
        status: "SCHEDULED",
        scheduledAt: { not: null },
      },
      select: { id: true, scheduledAt: true },
    });
  });

  it("shifts scheduledAt by the correct amount", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const original = new Date("2025-06-01T10:00:00Z");
    mockFindMany.mockResolvedValueOnce([{ id: ID_1, scheduledAt: original }]);

    await PATCH(makeRequest({ ids: [ID_1], shiftMinutes: 90 }));

    // $transaction receives an array of update promises — just verify it was called
    expect(mockTransaction).toHaveBeenCalled();
    // Verify update was called with the shifted time
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: ID_1 },
      data: { scheduledAt: new Date(original.getTime() + 90 * 60 * 1000) },
    });
  });

  it("returns rescheduled: 0 when no matching posts found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await PATCH(makeRequest({ ids: [ID_1], shiftMinutes: 30 }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { rescheduled: number };
    expect(data.rescheduled).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await PATCH(makeRequest({ ids: [ID_1], shiftMinutes: 30 }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when transaction fails", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([
      { id: ID_1, scheduledAt: new Date("2025-06-01T10:00:00Z") },
    ]);
    mockTransaction.mockRejectedValueOnce(new Error("Transaction failed"));

    const res = await PATCH(makeRequest({ ids: [ID_1], shiftMinutes: 30 }));
    expect(res.status).toBe(500);
  });
});
