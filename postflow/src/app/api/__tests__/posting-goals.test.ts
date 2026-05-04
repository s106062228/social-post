jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  GoalPeriod: {
    DAILY: "DAILY",
    WEEKLY: "WEEKLY",
    MONTHLY: "MONTHLY",
  },
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
  },
  PublishStatus: {
    PUBLISHED: "PUBLISHED",
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
    postingGoal: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    publishResult: {
      count: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listGoals, POST as createGoal } from "@/app/api/posting-goals/route";
import { DELETE as deleteGoal } from "@/app/api/posting-goals/[id]/route";
import { PATCH as toggleGoal } from "@/app/api/posting-goals/[id]/toggle/route";
import { GET as getProgress } from "@/app/api/posting-goals/progress/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.postingGoal.findMany as jest.Mock;
const mockFindUnique = prisma.postingGoal.findUnique as jest.Mock;
const mockCreate = prisma.postingGoal.create as jest.Mock;
const mockUpdate = prisma.postingGoal.update as jest.Mock;
const mockDelete = prisma.postingGoal.delete as jest.Mock;
const mockCount = prisma.postingGoal.count as jest.Mock;
const mockPublishResultCount = prisma.publishResult.count as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_GOAL_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_GOAL = {
  id: VALID_GOAL_ID,
  userId: MOCK_USER_ID,
  name: "Weekly Instagram target",
  targetCount: 5,
  period: "WEEKLY",
  platform: "INSTAGRAM",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posting-goals/${id}`, {
    method: "DELETE",
  });
}

function makePatchRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posting-goals/${id}/toggle`, {
    method: "PATCH",
  });
}

// ── GET /api/posting-goals ────────────────────────────────────────────────────

describe("GET /api/posting-goals", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listGoals();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listGoals();
    expect(res.status).toBe(429);
  });

  it("returns goals list", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_GOAL]);

    const res = await listGoals();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { goals: typeof BASE_GOAL[] };
    expect(body.goals).toHaveLength(1);
    expect(body.goals[0].name).toBe("Weekly Instagram target");
  });
});

// ── POST /api/posting-goals ───────────────────────────────────────────────────

describe("POST /api/posting-goals", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createGoal(
      makePostRequest("/api/posting-goals", { name: "Test", targetCount: 5, period: "WEEKLY" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createGoal(
      makePostRequest("/api/posting-goals", { name: "Test", targetCount: 5, period: "WEEKLY" })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 on invalid input", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createGoal(
      makePostRequest("/api/posting-goals", { name: "", targetCount: -1, period: "INVALID" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when max goals limit reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(20);

    const res = await createGoal(
      makePostRequest("/api/posting-goals", { name: "Test", targetCount: 5, period: "WEEKLY" })
    );
    expect(res.status).toBe(422);
  });

  it("creates a goal successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_GOAL);

    const res = await createGoal(
      makePostRequest("/api/posting-goals", {
        name: "Weekly Instagram target",
        targetCount: 5,
        period: "WEEKLY",
        platform: "INSTAGRAM",
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { goal: typeof BASE_GOAL };
    expect(body.goal.name).toBe("Weekly Instagram target");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Weekly Instagram target",
          targetCount: 5,
          period: "WEEKLY",
          platform: "INSTAGRAM",
        }),
      })
    );
  });

  it("creates a goal without platform", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce({ ...BASE_GOAL, platform: null });

    const res = await createGoal(
      makePostRequest("/api/posting-goals", {
        name: "Daily goal",
        targetCount: 2,
        period: "DAILY",
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { goal: { platform: null } };
    expect(body.goal.platform).toBeNull();
  });
});

// ── DELETE /api/posting-goals/[id] ───────────────────────────────────────────

describe("DELETE /api/posting-goals/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteGoal(makeDeleteRequest(VALID_GOAL_ID), {
      params: Promise.resolve({ id: VALID_GOAL_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteGoal(makeDeleteRequest(VALID_GOAL_ID), {
      params: Promise.resolve({ id: VALID_GOAL_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when goal not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await deleteGoal(makeDeleteRequest(VALID_GOAL_ID), {
      params: Promise.resolve({ id: VALID_GOAL_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when goal owned by another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });

    const res = await deleteGoal(makeDeleteRequest(VALID_GOAL_ID), {
      params: Promise.resolve({ id: VALID_GOAL_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("deletes goal successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockDelete.mockResolvedValueOnce(undefined);

    const res = await deleteGoal(makeDeleteRequest(VALID_GOAL_ID), {
      params: Promise.resolve({ id: VALID_GOAL_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

// ── PATCH /api/posting-goals/[id]/toggle ─────────────────────────────────────

describe("PATCH /api/posting-goals/[id]/toggle", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await toggleGoal(makePatchRequest(VALID_GOAL_ID), {
      params: Promise.resolve({ id: VALID_GOAL_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when goal not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await toggleGoal(makePatchRequest(VALID_GOAL_ID), {
      params: Promise.resolve({ id: VALID_GOAL_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("toggles goal from active to inactive", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, isActive: true });
    mockUpdate.mockResolvedValueOnce({ id: VALID_GOAL_ID, isActive: false });

    const res = await toggleGoal(makePatchRequest(VALID_GOAL_ID), {
      params: Promise.resolve({ id: VALID_GOAL_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { goal: { isActive: boolean } };
    expect(body.goal.isActive).toBe(false);
  });

  it("toggles goal from inactive to active", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, isActive: false });
    mockUpdate.mockResolvedValueOnce({ id: VALID_GOAL_ID, isActive: true });

    const res = await toggleGoal(makePatchRequest(VALID_GOAL_ID), {
      params: Promise.resolve({ id: VALID_GOAL_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { goal: { isActive: boolean } };
    expect(body.goal.isActive).toBe(true);
  });
});

// ── GET /api/posting-goals/progress ──────────────────────────────────────────

describe("GET /api/posting-goals/progress", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getProgress();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await getProgress();
    expect(res.status).toBe(429);
  });

  it("returns empty progress when no active goals", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await getProgress();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { progress: unknown[] };
    expect(body.progress).toHaveLength(0);
  });

  it("returns progress with correct shape and on-track status", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_GOAL]);
    mockPublishResultCount.mockResolvedValueOnce(5);

    const res = await getProgress();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      progress: {
        goalId: string;
        name: string;
        publishedCount: number;
        targetCount: number;
        percentage: number;
        onTrack: boolean;
      }[];
    };
    expect(body.progress).toHaveLength(1);
    const p = body.progress[0];
    expect(p.goalId).toBe(VALID_GOAL_ID);
    expect(p.name).toBe("Weekly Instagram target");
    expect(p.publishedCount).toBe(5);
    expect(p.targetCount).toBe(5);
    expect(p.percentage).toBe(100);
    expect(p.onTrack).toBe(true);
  });

  it("returns not-on-track when progress is below target", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_GOAL]);
    mockPublishResultCount.mockResolvedValueOnce(2);

    const res = await getProgress();
    const body = (await res.json()) as { progress: { onTrack: boolean; percentage: number }[] };
    expect(body.progress[0].onTrack).toBe(false);
    expect(body.progress[0].percentage).toBe(40);
  });

  it("caps percentage at 100 when overachieved", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_GOAL]);
    mockPublishResultCount.mockResolvedValueOnce(20);

    const res = await getProgress();
    const body = (await res.json()) as { progress: { percentage: number; onTrack: boolean }[] };
    expect(body.progress[0].percentage).toBe(100);
    expect(body.progress[0].onTrack).toBe(true);
  });
});
