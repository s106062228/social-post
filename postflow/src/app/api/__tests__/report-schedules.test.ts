jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  workerLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  ReportFrequency: {
    DAILY: "DAILY",
    WEEKLY: "WEEKLY",
    MONTHLY: "MONTHLY",
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

jest.mock("@/lib/db", () => ({
  prisma: {
    reportSchedule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listSchedules, POST as createSchedule, computeNextSendAt } from "@/app/api/report-schedules/route";
import { DELETE as deleteSchedule, PATCH as toggleSchedule } from "@/app/api/report-schedules/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { ReportFrequency } from "@prisma/client";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.reportSchedule.findMany as jest.Mock;
const mockFindUnique = prisma.reportSchedule.findUnique as jest.Mock;
const mockCreate = prisma.reportSchedule.create as jest.Mock;
const mockUpdate = prisma.reportSchedule.update as jest.Mock;
const mockDelete = prisma.reportSchedule.delete as jest.Mock;

const MOCK_USER_ID = "usr_test_001";
const SCHEDULE_ID = "sch_test_001";
const OTHER_USER_ID = "usr_other_001";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_SCHEDULE = {
  id: SCHEDULE_ID,
  userId: MOCK_USER_ID,
  frequency: ReportFrequency.WEEKLY,
  recipientEmail: "reports@example.com",
  isActive: true,
  lastSentAt: null,
  nextSendAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/report-schedules", {
    method: body ? "POST" : "GET",
    ...(body
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

// ── computeNextSendAt ─────────────────────────────────────────────────────────

describe("computeNextSendAt", () => {
  it("adds 1 day for DAILY", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const next = computeNextSendAt(ReportFrequency.DAILY, from);
    expect(next.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("adds 7 days for WEEKLY", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const next = computeNextSendAt(ReportFrequency.WEEKLY, from);
    expect(next.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("adds 1 month for MONTHLY", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const next = computeNextSendAt(ReportFrequency.MONTHLY, from);
    expect(next.getMonth()).toBe(1); // February
  });
});

// ── GET /api/report-schedules ─────────────────────────────────────────────────

describe("GET /api/report-schedules", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listSchedules();
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listSchedules();
    expect(res.status).toBe(429);
  });

  it("returns list of schedules", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_SCHEDULE]);

    const res = await listSchedules();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { schedules: typeof BASE_SCHEDULE[] };
    expect(data.schedules).toHaveLength(1);
    expect(data.schedules[0].frequency).toBe("WEEKLY");
    expect(data.schedules[0].recipientEmail).toBe("reports@example.com");
  });

  it("returns empty list when no schedules", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await listSchedules();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { schedules: unknown[] };
    expect(data.schedules).toHaveLength(0);
  });
});

// ── POST /api/report-schedules ────────────────────────────────────────────────

describe("POST /api/report-schedules", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createSchedule(makeRequest({ frequency: "WEEKLY", recipientEmail: "a@b.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createSchedule(makeRequest({ frequency: "WEEKLY", recipientEmail: "a@b.com" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for missing recipientEmail", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createSchedule(makeRequest({ frequency: "WEEKLY" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 for invalid email", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createSchedule(makeRequest({ frequency: "WEEKLY", recipientEmail: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid frequency", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createSchedule(makeRequest({ frequency: "HOURLY", recipientEmail: "a@b.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost/api/report-schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await createSchedule(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid JSON body");
  });

  it("creates schedule and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCreate.mockResolvedValueOnce(BASE_SCHEDULE);

    const res = await createSchedule(
      makeRequest({ frequency: "WEEKLY", recipientEmail: "reports@example.com" })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_SCHEDULE;
    expect(data.frequency).toBe("WEEKLY");
    expect(data.recipientEmail).toBe("reports@example.com");
    expect(data.isActive).toBe(true);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_USER_ID,
          frequency: "WEEKLY",
          recipientEmail: "reports@example.com",
        }),
      })
    );
  });

  it("accepts DAILY frequency", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCreate.mockResolvedValueOnce({ ...BASE_SCHEDULE, frequency: "DAILY" });

    const res = await createSchedule(
      makeRequest({ frequency: "DAILY", recipientEmail: "a@b.com" })
    );
    expect(res.status).toBe(201);
  });

  it("accepts MONTHLY frequency", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCreate.mockResolvedValueOnce({ ...BASE_SCHEDULE, frequency: "MONTHLY" });

    const res = await createSchedule(
      makeRequest({ frequency: "MONTHLY", recipientEmail: "a@b.com" })
    );
    expect(res.status).toBe(201);
  });
});

// ── DELETE /api/report-schedules/[id] ────────────────────────────────────────

const deleteParams = { params: Promise.resolve({ id: SCHEDULE_ID }) };

describe("DELETE /api/report-schedules/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteSchedule(new NextRequest("http://localhost"), deleteParams);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteSchedule(new NextRequest("http://localhost"), deleteParams);
    expect(res.status).toBe(429);
  });

  it("returns 404 when schedule not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await deleteSchedule(new NextRequest("http://localhost"), deleteParams);
    expect(res.status).toBe(404);
  });

  it("returns 403 when schedule belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });

    const res = await deleteSchedule(new NextRequest("http://localhost"), deleteParams);
    expect(res.status).toBe(403);
  });

  it("deletes schedule and returns 204", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockDelete.mockResolvedValueOnce({});

    const res = await deleteSchedule(new NextRequest("http://localhost"), deleteParams);
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: SCHEDULE_ID } });
  });
});

// ── PATCH /api/report-schedules/[id] (toggle) ────────────────────────────────

const patchParams = { params: Promise.resolve({ id: SCHEDULE_ID }) };

describe("PATCH /api/report-schedules/[id] (toggle)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await toggleSchedule(new NextRequest("http://localhost"), patchParams);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await toggleSchedule(new NextRequest("http://localhost"), patchParams);
    expect(res.status).toBe(429);
  });

  it("returns 404 when schedule not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await toggleSchedule(new NextRequest("http://localhost"), patchParams);
    expect(res.status).toBe(404);
  });

  it("returns 403 when owned by another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID, isActive: true, frequency: "WEEKLY" });

    const res = await toggleSchedule(new NextRequest("http://localhost"), patchParams);
    expect(res.status).toBe(403);
  });

  it("toggles active→paused and returns updated schedule", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, isActive: true, frequency: "WEEKLY" });
    mockUpdate.mockResolvedValueOnce({ ...BASE_SCHEDULE, isActive: false });

    const res = await toggleSchedule(new NextRequest("http://localhost"), patchParams);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isActive: boolean };
    expect(data.isActive).toBe(false);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false }),
      })
    );
  });

  it("toggles paused→active and resets nextSendAt", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, isActive: false, frequency: "DAILY" });
    mockUpdate.mockResolvedValueOnce({ ...BASE_SCHEDULE, isActive: true });

    const res = await toggleSchedule(new NextRequest("http://localhost"), patchParams);
    expect(res.status).toBe(200);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: true,
          nextSendAt: expect.any(Date),
        }),
      })
    );
  });
});
