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

const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockCount = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    postQueueSlot: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/queue-slots/route";
import { DELETE } from "@/app/api/queue-slots/[id]/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const SLOT_ID = "clh3ck8zp0001qr5hyvxckahk";

const SAMPLE_SLOT = {
  id: SLOT_ID,
  label: "Morning",
  platform: null,
  hour: 9,
  minute: 0,
  daysOfWeek: [1, 2, 3, 4, 5],
  isActive: true,
  createdAt: new Date("2026-04-01T00:00:00Z"),
};

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/queue-slots", { method: "GET" });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/queue-slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/queue-slots/${id}`, { method: "DELETE" });
}

async function callDelete(id: string) {
  return DELETE(makeDeleteRequest(id), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
});

// ── GET /api/queue-slots ──────────────────────────────────────────────────────

describe("GET /api/queue-slots", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate-limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("returns slots with annotations on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([SAMPLE_SLOT]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { slots: unknown[] };
    expect(data.slots).toHaveLength(1);
    const slot = data.slots[0] as { timeLabel: string; daysLabel: string };
    expect(slot.timeLabel).toBe("09:00");
    expect(slot.daysLabel).toBe("Mon, Tue, Wed, Thu, Fri");
  });

  it("annotates every-day slot correctly", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([{ ...SAMPLE_SLOT, daysOfWeek: [] }]);
    const res = await GET();
    const data = (await res.json()) as { slots: { daysLabel: string }[] };
    expect(data.slots[0].daysLabel).toBe("Every day");
  });

  it("returns empty array when no slots", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { slots: unknown[] };
    expect(data.slots).toHaveLength(0);
  });

  it("returns 500 on db error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockRejectedValueOnce(new Error("DB error"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

// ── POST /api/queue-slots ─────────────────────────────────────────────────────

describe("POST /api/queue-slots", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makePostRequest({ hour: 9, minute: 0 }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await POST(makePostRequest({ hour: 9 }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const req = new NextRequest("http://localhost:3000/api/queue-slots", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 when hour is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makePostRequest({ minute: 0 }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when hour is out of range", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makePostRequest({ hour: 25 }));
    expect(res.status).toBe(400);
  });

  it("returns 422 when slot count limit reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockCount.mockResolvedValueOnce(50);
    const res = await POST(makePostRequest({ hour: 9 }));
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Maximum 50/);
  });

  it("creates slot with valid data", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockCount.mockResolvedValueOnce(3);
    mockCreate.mockResolvedValueOnce(SAMPLE_SLOT);

    const res = await POST(
      makePostRequest({ hour: 9, minute: 0, daysOfWeek: [1, 2, 3, 4, 5], label: "Morning" })
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: MOCK_USER_ID, hour: 9, minute: 0 }),
      })
    );
  });

  it("accepts null platform (all platforms)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce({ ...SAMPLE_SLOT, platform: null });

    const res = await POST(makePostRequest({ hour: 14, platform: null }));
    expect(res.status).toBe(201);
  });

  it("accepts valid platform value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce({ ...SAMPLE_SLOT, platform: "INSTAGRAM" });

    const res = await POST(makePostRequest({ hour: 14, platform: "INSTAGRAM" }));
    expect(res.status).toBe(201);
  });

  it("rejects invalid platform value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makePostRequest({ hour: 9, platform: "TIKTOK" }));
    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/queue-slots/[id] ──────────────────────────────────────────────

describe("DELETE /api/queue-slots/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await callDelete(SLOT_ID);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await callDelete(SLOT_ID);
    expect(res.status).toBe(429);
  });

  it("returns 404 when slot not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await callDelete(SLOT_ID);
    expect(res.status).toBe(404);
  });

  it("returns 403 when slot belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({ userId: "other-user" });
    const res = await callDelete(SLOT_ID);
    expect(res.status).toBe(403);
  });

  it("deletes slot and returns success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockDelete.mockResolvedValueOnce({});
    const res = await callDelete(SLOT_ID);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: SLOT_ID } });
  });

  it("returns 500 on db error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockRejectedValueOnce(new Error("DB error"));
    const res = await callDelete(SLOT_ID);
    expect(res.status).toBe(500);
  });
});
