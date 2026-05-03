jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  AlertMetric: {
    IMPRESSIONS: "IMPRESSIONS",
    REACH: "REACH",
    LIKES: "LIKES",
    COMMENTS: "COMMENTS",
    SHARES: "SHARES",
    SCORE: "SCORE",
  },
  AlertOperator: {
    ABOVE: "ABOVE",
    BELOW: "BELOW",
  },
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
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
    performanceAlert: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listAlerts, POST as createAlert } from "@/app/api/performance-alerts/route";
import { DELETE as deleteAlert } from "@/app/api/performance-alerts/[id]/route";
import { PATCH as toggleAlert } from "@/app/api/performance-alerts/[id]/toggle/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.performanceAlert.findMany as jest.Mock;
const mockFindUnique = prisma.performanceAlert.findUnique as jest.Mock;
const mockCreate = prisma.performanceAlert.create as jest.Mock;
const mockCount = prisma.performanceAlert.count as jest.Mock;
const mockDelete = prisma.performanceAlert.delete as jest.Mock;
const mockUpdate = prisma.performanceAlert.update as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_ALERT_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_ALERT = {
  id: VALID_ALERT_ID,
  userId: MOCK_USER_ID,
  name: "Low likes warning",
  metric: "LIKES",
  operator: "BELOW",
  threshold: 50,
  platform: null,
  period: "7d",
  isActive: true,
  lastTriggeredAt: null,
  createdAt: new Date(),
};

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/performance-alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/performance-alerts/${id}`, {
    method: "DELETE",
  });
}

function makeToggleRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/performance-alerts/${id}/toggle`, {
    method: "PATCH",
  });
}

// ── GET /api/performance-alerts ─────────────────────────────────────────���─────

describe("GET /api/performance-alerts", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listAlerts();
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listAlerts();
    expect(res.status).toBe(429);
  });

  it("returns empty alerts array when none exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await listAlerts();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { alerts: unknown[] };
    expect(Array.isArray(data.alerts)).toBe(true);
    expect(data.alerts).toHaveLength(0);
  });

  it("returns list of alerts with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_ALERT]);
    const res = await listAlerts();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { alerts: typeof BASE_ALERT[] };
    expect(data.alerts).toHaveLength(1);
    expect(data.alerts[0].name).toBe("Low likes warning");
    expect(data.alerts[0].metric).toBe("LIKES");
    expect(data.alerts[0].operator).toBe("BELOW");
    expect(data.alerts[0].threshold).toBe(50);
  });
});

// ── POST /api/performance-alerts ──────────────────────────────────────────────

describe("POST /api/performance-alerts", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createAlert(
      makePostRequest({ name: "Test", metric: "LIKES", operator: "BELOW", threshold: 10 })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createAlert(
      makePostRequest({ name: "Test", metric: "LIKES", operator: "BELOW", threshold: 10 })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createAlert(
      makePostRequest({ metric: "LIKES", operator: "BELOW", threshold: 10 })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when metric is invalid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createAlert(
      makePostRequest({ name: "Test", metric: "INVALID", operator: "BELOW", threshold: 10 })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when max alert limit reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(20);
    const res = await createAlert(
      makePostRequest({ name: "One More", metric: "LIKES", operator: "BELOW", threshold: 10 })
    );
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Maximum/);
  });

  it("creates alert and returns 201 with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_ALERT);

    const res = await createAlert(
      makePostRequest({ name: "Low likes warning", metric: "LIKES", operator: "BELOW", threshold: 50 })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_ALERT;
    expect(data.name).toBe("Low likes warning");
    expect(data.metric).toBe("LIKES");
    expect(data.threshold).toBe(50);
  });

  it("creates alert with optional platform", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce({ ...BASE_ALERT, platform: "FACEBOOK" });

    const res = await createAlert(
      makePostRequest({
        name: "FB likes",
        metric: "LIKES",
        operator: "ABOVE",
        threshold: 100,
        platform: "FACEBOOK",
        period: "30d",
      })
    );
    expect(res.status).toBe(201);
  });
});

// ── DELETE /api/performance-alerts/[id] ───────────────────────────────────────

describe("DELETE /api/performance-alerts/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteAlert(makeDeleteRequest(VALID_ALERT_ID), {
      params: Promise.resolve({ id: VALID_ALERT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteAlert(makeDeleteRequest(VALID_ALERT_ID), {
      params: Promise.resolve({ id: VALID_ALERT_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for short/invalid ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await deleteAlert(makeDeleteRequest("bad"), {
      params: Promise.resolve({ id: "bad" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when alert belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_ALERT, userId: OTHER_USER_ID });
    const res = await deleteAlert(makeDeleteRequest(VALID_ALERT_ID), {
      params: Promise.resolve({ id: VALID_ALERT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_ALERT);
    mockDelete.mockResolvedValueOnce(BASE_ALERT);
    const res = await deleteAlert(makeDeleteRequest(VALID_ALERT_ID), {
      params: Promise.resolve({ id: VALID_ALERT_ID }),
    });
    expect(res.status).toBe(204);
  });
});

// ── PATCH /api/performance-alerts/[id]/toggle ─────────────────────────────────

describe("PATCH /api/performance-alerts/[id]/toggle", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await toggleAlert(makeToggleRequest(VALID_ALERT_ID), {
      params: Promise.resolve({ id: VALID_ALERT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await toggleAlert(makeToggleRequest(VALID_ALERT_ID), {
      params: Promise.resolve({ id: VALID_ALERT_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for short/invalid ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await toggleAlert(makeToggleRequest("x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when alert belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID, isActive: true });
    const res = await toggleAlert(makeToggleRequest(VALID_ALERT_ID), {
      params: Promise.resolve({ id: VALID_ALERT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("toggles active alert to paused", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, isActive: true });
    mockUpdate.mockResolvedValueOnce({ id: VALID_ALERT_ID, isActive: false });

    const res = await toggleAlert(makeToggleRequest(VALID_ALERT_ID), {
      params: Promise.resolve({ id: VALID_ALERT_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isActive: boolean };
    expect(data.isActive).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
  });

  it("toggles paused alert to active", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, isActive: false });
    mockUpdate.mockResolvedValueOnce({ id: VALID_ALERT_ID, isActive: true });

    const res = await toggleAlert(makeToggleRequest(VALID_ALERT_ID), {
      params: Promise.resolve({ id: VALID_ALERT_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isActive: boolean };
    expect(data.isActive).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } })
    );
  });
});
