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
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    blackoutPeriod: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/blackout", () => ({
  isInBlackout: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/blackout-periods/route";
import { DELETE } from "@/app/api/blackout-periods/[id]/route";
import { POST as checkBlackout } from "@/app/api/posts/[id]/check-blackout/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { isInBlackout } from "@/lib/blackout";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockIsInBlackout = isInBlackout as jest.Mock;

const mockBlackoutFindMany = prisma.blackoutPeriod.findMany as jest.Mock;
const mockBlackoutCreate = prisma.blackoutPeriod.create as jest.Mock;
const mockBlackoutCount = prisma.blackoutPeriod.count as jest.Mock;
const mockBlackoutFindUnique = prisma.blackoutPeriod.findUnique as jest.Mock;
const mockBlackoutDelete = prisma.blackoutPeriod.delete as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/blackout-periods", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeIdRequest(id: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/blackout-periods/${id}`, {
    method: body ? "POST" : "DELETE",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const FUTURE_START = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
const FUTURE_END = new Date(Date.now() + 48 * 60 * 60_000).toISOString();

const SAMPLE_PERIOD = {
  id: "period1",
  name: "Christmas Break",
  startDate: new Date(FUTURE_START),
  endDate: new Date(FUTURE_END),
  isRecurring: false,
  daysOfWeek: [],
  createdAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "user1" } });
  mockApiLimiter.mockResolvedValue({ success: true });
});

// ── GET /api/blackout-periods ───────────────────────────────────────────────────

describe("GET /api/blackout-periods", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("returns list of blackout periods", async () => {
    mockBlackoutFindMany.mockResolvedValueOnce([SAMPLE_PERIOD]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.periods).toHaveLength(1);
    expect(data.periods[0].name).toBe("Christmas Break");
  });

  it("returns empty list when no periods", async () => {
    mockBlackoutFindMany.mockResolvedValueOnce([]);
    const res = await GET();
    const data = await res.json();
    expect(data.periods).toHaveLength(0);
  });
});

// ── POST /api/blackout-periods ────────────────────────────────────────────────

describe("POST /api/blackout-periods", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ name: "Break", startDate: FUTURE_START, endDate: FUTURE_END }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when endDate <= startDate", async () => {
    mockBlackoutCount.mockResolvedValueOnce(0);
    const res = await POST(
      makeRequest({ name: "Break", startDate: FUTURE_END, endDate: FUTURE_START })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/after/i);
  });

  it("returns 400 on invalid body", async () => {
    const res = await POST(makeRequest({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 422 when max periods exceeded", async () => {
    mockBlackoutCount.mockResolvedValueOnce(50);
    const res = await POST(
      makeRequest({ name: "Break", startDate: FUTURE_START, endDate: FUTURE_END })
    );
    expect(res.status).toBe(422);
  });

  it("creates a blackout period successfully", async () => {
    mockBlackoutCount.mockResolvedValueOnce(0);
    mockBlackoutCreate.mockResolvedValueOnce(SAMPLE_PERIOD);
    const res = await POST(
      makeRequest({ name: "Christmas Break", startDate: FUTURE_START, endDate: FUTURE_END })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Christmas Break");
    expect(mockBlackoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user1",
          name: "Christmas Break",
          isRecurring: false,
          daysOfWeek: [],
        }),
      })
    );
  });

  it("creates a recurring blackout with daysOfWeek", async () => {
    mockBlackoutCount.mockResolvedValueOnce(0);
    const recurringPeriod = { ...SAMPLE_PERIOD, isRecurring: true, daysOfWeek: [0, 6] };
    mockBlackoutCreate.mockResolvedValueOnce(recurringPeriod);
    const res = await POST(
      makeRequest({
        name: "Weekend Blackout",
        startDate: FUTURE_START,
        endDate: FUTURE_END,
        isRecurring: true,
        daysOfWeek: [0, 6],
      })
    );
    expect(res.status).toBe(201);
    expect(mockBlackoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isRecurring: true, daysOfWeek: [0, 6] }),
      })
    );
  });
});

// ── DELETE /api/blackout-periods/[id] ──────────────────────────────────────────────

describe("DELETE /api/blackout-periods/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await DELETE(makeIdRequest("cltest1234567890abcde"), {
      params: Promise.resolve({ id: "cltest1234567890abcde" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when period not found", async () => {
    mockBlackoutFindUnique.mockResolvedValueOnce(null);
    const res = await DELETE(makeIdRequest("cltest1234567890abcde"), {
      params: Promise.resolve({ id: "cltest1234567890abcde" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when period belongs to another user", async () => {
    mockBlackoutFindUnique.mockResolvedValueOnce({ userId: "other-user" });
    const res = await DELETE(makeIdRequest("cltest1234567890abcde"), {
      params: Promise.resolve({ id: "cltest1234567890abcde" }),
    });
    expect(res.status).toBe(403);
  });

  it("deletes successfully", async () => {
    mockBlackoutFindUnique.mockResolvedValueOnce({ userId: "user1" });
    mockBlackoutDelete.mockResolvedValueOnce({});
    const res = await DELETE(makeIdRequest("cltest1234567890abcde"), {
      params: Promise.resolve({ id: "cltest1234567890abcde" }),
    });
    expect(res.status).toBe(204);
  });
});

// ── POST /api/posts/[id]/check-blackout ─────────────────────────────────────────────

describe("POST /api/posts/[id]/check-blackout", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await checkBlackout(makeIdRequest("cltest1234567890abcde"), {
      params: Promise.resolve({ id: "cltest1234567890abcde" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when post not found", async () => {
    mockPostFindUnique.mockResolvedValueOnce(null);
    const res = await checkBlackout(makeIdRequest("cltest1234567890abcde"), {
      params: Promise.resolve({ id: "cltest1234567890abcde" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 for another user's post", async () => {
    mockPostFindUnique.mockResolvedValueOnce({ userId: "other", scheduledAt: null });
    const res = await checkBlackout(makeIdRequest("cltest1234567890abcde"), {
      params: Promise.resolve({ id: "cltest1234567890abcde" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns blocked=false when no scheduledAt", async () => {
    mockPostFindUnique.mockResolvedValueOnce({ userId: "user1", scheduledAt: null });
    const res = await checkBlackout(makeIdRequest("cltest1234567890abcde"), {
      params: Promise.resolve({ id: "cltest1234567890abcde" }),
    });
    const data = await res.json();
    expect(data.blocked).toBe(false);
  });

  it("returns blocked=false when outside blackout", async () => {
    mockPostFindUnique.mockResolvedValueOnce({
      userId: "user1",
      scheduledAt: new Date(FUTURE_START),
    });
    mockBlackoutFindMany.mockResolvedValueOnce([]);
    mockIsInBlackout.mockReturnValueOnce(null);
    const res = await checkBlackout(makeIdRequest("cltest1234567890abcde"), {
      params: Promise.resolve({ id: "cltest1234567890abcde" }),
    });
    const data = await res.json();
    expect(data.blocked).toBe(false);
  });

  it("returns blocked=true with period name when inside blackout", async () => {
    mockPostFindUnique.mockResolvedValueOnce({
      userId: "user1",
      scheduledAt: new Date(FUTURE_START),
    });
    mockBlackoutFindMany.mockResolvedValueOnce([SAMPLE_PERIOD]);
    mockIsInBlackout.mockReturnValueOnce("Christmas Break");
    const res = await checkBlackout(makeIdRequest("cltest1234567890abcde"), {
      params: Promise.resolve({ id: "cltest1234567890abcde" }),
    });
    const data = await res.json();
    expect(data.blocked).toBe(true);
    expect(data.periodName).toBe("Christmas Break");
  });
});
