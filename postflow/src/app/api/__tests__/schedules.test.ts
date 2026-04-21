jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
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
    recurringSchedule: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/sanitize", () => ({
  sanitizePostContent: jest.fn((s: string) => s.trim()),
}));

jest.mock("@/lib/queue/scheduler", () => ({
  calcNextRunAt: jest.fn(() => new Date("2026-05-01T09:00:00Z")),
  isValidCronExpr: jest.fn(() => true),
}));

import { NextRequest } from "next/server";
import { GET as listSchedules, POST as createSchedule } from "@/app/api/schedules/route";
import { DELETE as deleteSchedule } from "@/app/api/schedules/[id]/route";
import { POST as toggleSchedule } from "@/app/api/schedules/[id]/toggle/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { isValidCronExpr, calcNextRunAt } from "@/lib/queue/scheduler";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockIsValidCronExpr = isValidCronExpr as jest.Mock;
const mockCalcNextRunAt = calcNextRunAt as jest.Mock;
const mockFindMany = prisma.recurringSchedule.findMany as jest.Mock;
const mockCount = prisma.recurringSchedule.count as jest.Mock;
const mockCreate = prisma.recurringSchedule.create as jest.Mock;
const mockFindUnique = prisma.recurringSchedule.findUnique as jest.Mock;
const mockDelete = prisma.recurringSchedule.delete as jest.Mock;
const mockUpdate = prisma.recurringSchedule.update as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const SCHEDULE_ID = "clh3ck8zp0001qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_SCHEDULE = {
  id: SCHEDULE_ID,
  userId: MOCK_USER_ID,
  name: "Daily Post",
  content: "Hello world",
  mediaType: "NONE",
  mediaUrls: [],
  platforms: ["FACEBOOK"],
  cronExpr: "0 9 * * *",
  timezone: "UTC",
  isActive: true,
  lastRunAt: null,
  nextRunAt: new Date("2026-05-01T09:00:00Z"),
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── GET /api/schedules ────────────────────────────────────────────────────────

describe("GET /api/schedules", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(query = "") {
    return new NextRequest(`http://localhost:3000/api/schedules${query}`);
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listSchedules(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listSchedules(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns paginated schedules", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_SCHEDULE]);
    mockCount.mockResolvedValueOnce(1);

    const res = await listSchedules(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { schedules: typeof BASE_SCHEDULE[]; pagination: { total: number } };
    expect(data.schedules).toHaveLength(1);
    expect(data.pagination.total).toBe(1);
  });

  it("queries with the authenticated user's id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);

    await listSchedules(makeRequest());
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });
});

// ── POST /api/schedules ───────────────────────────────────────────────────────

describe("POST /api/schedules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsValidCronExpr.mockReturnValue(true);
    mockCalcNextRunAt.mockReturnValue(new Date("2026-05-01T09:00:00Z"));
  });

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const VALID_BODY = {
    name: "Daily Post",
    content: "Hello world",
    platforms: ["FACEBOOK"],
    cronExpr: "0 9 * * *",
  };

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createSchedule(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createSchedule(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/schedules", {
      method: "POST",
      body: "not-json",
    });
    const res = await createSchedule(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const { name: _n, ...body } = VALID_BODY;
    const res = await createSchedule(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createSchedule(makeRequest({ ...VALID_BODY, platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when cron expression is invalid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsValidCronExpr.mockReturnValueOnce(false);
    const res = await createSchedule(makeRequest({ ...VALID_BODY, cronExpr: "not-a-cron" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { issues: Record<string, string[]> };
    expect(data.issues.cronExpr).toBeDefined();
  });

  it("returns 201 with created schedule", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCreate.mockResolvedValueOnce(BASE_SCHEDULE);

    const res = await createSchedule(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_SCHEDULE;
    expect(data.name).toBe("Daily Post");
  });

  it("creates schedule with correct userId", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCreate.mockResolvedValueOnce(BASE_SCHEDULE);

    await createSchedule(makeRequest(VALID_BODY));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: MOCK_USER_ID }),
      })
    );
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCreate.mockRejectedValueOnce(new Error("DB error"));
    const res = await createSchedule(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });
});

// ── DELETE /api/schedules/[id] ────────────────────────────────────────────────

describe("DELETE /api/schedules/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id = SCHEDULE_ID) {
    return new NextRequest(`http://localhost:3000/api/schedules/${id}`, { method: "DELETE" });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 when schedule does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await deleteSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(res.status).toBe(404);
  });

  it("returns 403 when schedule belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    const res = await deleteSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(res.status).toBe(403);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockDelete.mockResolvedValueOnce(BASE_SCHEDULE);
    const res = await deleteSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(res.status).toBe(204);
  });

  it("calls prisma.recurringSchedule.delete with correct id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockDelete.mockResolvedValueOnce(BASE_SCHEDULE);
    await deleteSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: SCHEDULE_ID } });
  });
});

// ── POST /api/schedules/[id]/toggle ──────────────────────────────────────────

describe("POST /api/schedules/[id]/toggle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCalcNextRunAt.mockReturnValue(new Date("2026-05-01T09:00:00Z"));
  });

  function makeRequest(id = SCHEDULE_ID) {
    return new NextRequest(`http://localhost:3000/api/schedules/${id}/toggle`, { method: "POST" });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await toggleSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when schedule does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await toggleSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(res.status).toBe(404);
  });

  it("returns 403 when schedule belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_SCHEDULE, userId: OTHER_USER_ID });
    const res = await toggleSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(res.status).toBe(403);
  });

  it("toggles isActive from true to false and clears nextRunAt", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_SCHEDULE, isActive: true });
    mockUpdate.mockResolvedValueOnce({ ...BASE_SCHEDULE, isActive: false, nextRunAt: null });

    const res = await toggleSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false, nextRunAt: null }),
      })
    );
  });

  it("toggles isActive from false to true and sets nextRunAt", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_SCHEDULE, isActive: false });
    const newNextRun = new Date("2026-05-01T09:00:00Z");
    mockCalcNextRunAt.mockReturnValueOnce(newNextRun);
    mockUpdate.mockResolvedValueOnce({ ...BASE_SCHEDULE, isActive: true, nextRunAt: newNextRun });

    const res = await toggleSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: true, nextRunAt: newNextRun }),
      })
    );
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_SCHEDULE);
    mockUpdate.mockRejectedValueOnce(new Error("DB error"));
    const res = await toggleSchedule(makeRequest(), makeParams(SCHEDULE_ID));
    expect(res.status).toBe(500);
  });
});
