jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  workerLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
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
  EngagementMetric: {
    IMPRESSIONS: "IMPRESSIONS",
    REACH: "REACH",
    LIKES: "LIKES",
    COMMENTS: "COMMENTS",
    SHARES: "SHARES",
    SCORE: "SCORE",
  },
  EngagementAggregation: {
    TOTAL: "TOTAL",
    AVERAGE: "AVERAGE",
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
    engagementGoal: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    postInsights: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/content-score", () => ({
  computeScore: jest.fn().mockReturnValue(50),
}));

import { NextRequest } from "next/server";
import { GET as listGoals, POST as createGoal } from "@/app/api/engagement-goals/route";
import { DELETE as deleteGoal } from "@/app/api/engagement-goals/[id]/route";
import { POST as toggleGoal } from "@/app/api/engagement-goals/[id]/toggle/route";
import { GET as getProgress } from "@/app/api/engagement-goals/progress/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const SESSION = { user: { id: "user1", email: "test@example.com" } };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockApiLimiter.mockResolvedValue({ success: true });
});

// ── Auth & Rate limit guards ───────────────────────────────────────────────────

describe("GET /api/engagement-goals — auth", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listGoals();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false });
    const res = await listGoals();
    expect(res.status).toBe(429);
  });
});

// ── GET /api/engagement-goals ─────────────────────────────────────────────────

describe("GET /api/engagement-goals", () => {
  it("returns list of goals", async () => {
    const mockGoals = [
      {
        id: "goal1",
        name: "500 likes weekly",
        metric: "LIKES",
        targetValue: 500,
        aggregation: "TOTAL",
        period: "WEEKLY",
        platform: null,
        isActive: true,
        lastNotifiedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    (mockPrisma.engagementGoal.findMany as jest.Mock).mockResolvedValue(mockGoals);

    const res = await listGoals();
    expect(res.status).toBe(200);
    const body = await res.json() as { goals: typeof mockGoals };
    expect(body.goals).toHaveLength(1);
    expect(body.goals[0].name).toBe("500 likes weekly");
    expect(body.goals[0].metric).toBe("LIKES");
  });

  it("returns empty array when no goals", async () => {
    (mockPrisma.engagementGoal.findMany as jest.Mock).mockResolvedValue([]);
    const res = await listGoals();
    expect(res.status).toBe(200);
    const body = await res.json() as { goals: unknown[] };
    expect(body.goals).toHaveLength(0);
  });
});

// ── POST /api/engagement-goals ────────────────────────────────────────────────

describe("POST /api/engagement-goals", () => {
  it("creates a goal with valid data", async () => {
    (mockPrisma.engagementGoal.count as jest.Mock).mockResolvedValue(0);
    const mockGoal = {
      id: "goal1",
      name: "100 avg likes monthly",
      metric: "LIKES",
      targetValue: 100,
      aggregation: "AVERAGE",
      period: "MONTHLY",
      platform: null,
      isActive: true,
      lastNotifiedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (mockPrisma.engagementGoal.create as jest.Mock).mockResolvedValue(mockGoal);

    const req = new NextRequest("http://localhost/api/engagement-goals", {
      method: "POST",
      body: JSON.stringify({
        name: "100 avg likes monthly",
        metric: "LIKES",
        targetValue: 100,
        aggregation: "AVERAGE",
        period: "MONTHLY",
      }),
    });

    const res = await createGoal(req);
    expect(res.status).toBe(201);
    const body = await res.json() as { goal: typeof mockGoal };
    expect(body.goal.name).toBe("100 avg likes monthly");
    expect(body.goal.metric).toBe("LIKES");
    expect(body.goal.targetValue).toBe(100);
  });

  it("rejects when max goals limit reached", async () => {
    (mockPrisma.engagementGoal.count as jest.Mock).mockResolvedValue(20);

    const req = new NextRequest("http://localhost/api/engagement-goals", {
      method: "POST",
      body: JSON.stringify({
        name: "New Goal",
        metric: "LIKES",
        targetValue: 100,
        period: "WEEKLY",
      }),
    });

    const res = await createGoal(req);
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid body", async () => {
    (mockPrisma.engagementGoal.count as jest.Mock).mockResolvedValue(0);

    const req = new NextRequest("http://localhost/api/engagement-goals", {
      method: "POST",
      body: JSON.stringify({ name: "", metric: "INVALID_METRIC" }),
    });

    const res = await createGoal(req);
    expect(res.status).toBe(400);
  });

  it("supports platform-specific goals", async () => {
    (mockPrisma.engagementGoal.count as jest.Mock).mockResolvedValue(0);
    const mockGoal = {
      id: "goal2",
      name: "Facebook reach",
      metric: "REACH",
      targetValue: 1000,
      aggregation: "AVERAGE",
      period: "WEEKLY",
      platform: "FACEBOOK",
      isActive: true,
      lastNotifiedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (mockPrisma.engagementGoal.create as jest.Mock).mockResolvedValue(mockGoal);

    const req = new NextRequest("http://localhost/api/engagement-goals", {
      method: "POST",
      body: JSON.stringify({
        name: "Facebook reach",
        metric: "REACH",
        targetValue: 1000,
        period: "WEEKLY",
        platform: "FACEBOOK",
      }),
    });

    const res = await createGoal(req);
    expect(res.status).toBe(201);
    const body = await res.json() as { goal: { platform: string } };
    expect(body.goal.platform).toBe("FACEBOOK");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/engagement-goals", {
      method: "POST",
      body: JSON.stringify({ name: "Test", metric: "LIKES", targetValue: 100, period: "WEEKLY" }),
    });
    const res = await createGoal(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false });
    const req = new NextRequest("http://localhost/api/engagement-goals", {
      method: "POST",
      body: JSON.stringify({ name: "Test", metric: "LIKES", targetValue: 100, period: "WEEKLY" }),
    });
    const res = await createGoal(req);
    expect(res.status).toBe(429);
  });
});

// ── DELETE /api/engagement-goals/[id] ────────────────────────────────────────

describe("DELETE /api/engagement-goals/[id]", () => {
  it("deletes a goal owned by the user", async () => {
    (mockPrisma.engagementGoal.findUnique as jest.Mock).mockResolvedValue({
      id: "goal1",
      userId: "user1",
    });
    (mockPrisma.engagementGoal.delete as jest.Mock).mockResolvedValue({});

    const req = new NextRequest("http://localhost/api/engagement-goals/goal1", {
      method: "DELETE",
    });
    const res = await deleteGoal(req, { params: Promise.resolve({ id: "goal1" }) });
    expect(res.status).toBe(204);
  });

  it("returns 404 when goal not found", async () => {
    (mockPrisma.engagementGoal.findUnique as jest.Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/engagement-goals/nonexistent", {
      method: "DELETE",
    });
    const res = await deleteGoal(req, { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when goal belongs to another user", async () => {
    (mockPrisma.engagementGoal.findUnique as jest.Mock).mockResolvedValue({
      id: "goal1",
      userId: "other-user",
    });

    const req = new NextRequest("http://localhost/api/engagement-goals/goal1", {
      method: "DELETE",
    });
    const res = await deleteGoal(req, { params: Promise.resolve({ id: "goal1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/engagement-goals/goal1", {
      method: "DELETE",
    });
    const res = await deleteGoal(req, { params: Promise.resolve({ id: "goal1" }) });
    expect(res.status).toBe(401);
  });
});

// ── POST /api/engagement-goals/[id]/toggle ────────────────────────────────────

describe("POST /api/engagement-goals/[id]/toggle", () => {
  it("toggles active to inactive", async () => {
    (mockPrisma.engagementGoal.findUnique as jest.Mock).mockResolvedValue({
      id: "goal1",
      userId: "user1",
      isActive: true,
    });
    (mockPrisma.engagementGoal.update as jest.Mock).mockResolvedValue({
      id: "goal1",
      isActive: false,
    });

    const req = new NextRequest("http://localhost/api/engagement-goals/goal1/toggle", {
      method: "POST",
    });
    const res = await toggleGoal(req, { params: Promise.resolve({ id: "goal1" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { isActive: boolean };
    expect(body.isActive).toBe(false);
    expect(mockPrisma.engagementGoal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
  });

  it("toggles inactive to active", async () => {
    (mockPrisma.engagementGoal.findUnique as jest.Mock).mockResolvedValue({
      id: "goal1",
      userId: "user1",
      isActive: false,
    });
    (mockPrisma.engagementGoal.update as jest.Mock).mockResolvedValue({
      id: "goal1",
      isActive: true,
    });

    const req = new NextRequest("http://localhost/api/engagement-goals/goal1/toggle", {
      method: "POST",
    });
    const res = await toggleGoal(req, { params: Promise.resolve({ id: "goal1" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { isActive: boolean };
    expect(body.isActive).toBe(true);
  });

  it("returns 403 for wrong owner", async () => {
    (mockPrisma.engagementGoal.findUnique as jest.Mock).mockResolvedValue({
      id: "goal1",
      userId: "other-user",
      isActive: true,
    });

    const req = new NextRequest("http://localhost/api/engagement-goals/goal1/toggle", {
      method: "POST",
    });
    const res = await toggleGoal(req, { params: Promise.resolve({ id: "goal1" }) });
    expect(res.status).toBe(403);
  });
});

// ── GET /api/engagement-goals/progress ───────────────────────────────────────

describe("GET /api/engagement-goals/progress", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getProgress();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false });
    const res = await getProgress();
    expect(res.status).toBe(429);
  });

  it("returns empty progress when no active goals", async () => {
    (mockPrisma.engagementGoal.findMany as jest.Mock).mockResolvedValue([]);
    const res = await getProgress();
    expect(res.status).toBe(200);
    const body = await res.json() as { progress: unknown[] };
    expect(body.progress).toHaveLength(0);
  });

  it("computes progress for TOTAL aggregation", async () => {
    const mockGoal = {
      id: "goal1",
      userId: "user1",
      name: "Total likes",
      metric: "LIKES",
      targetValue: 100,
      aggregation: "TOTAL",
      period: "WEEKLY",
      platform: null,
      isActive: true,
    };
    (mockPrisma.engagementGoal.findMany as jest.Mock).mockResolvedValue([mockGoal]);
    (mockPrisma.postInsights.findMany as jest.Mock).mockResolvedValue([
      { impressions: 500, reach: 300, likes: 60, comments: 5, shares: 3 },
      { impressions: 400, reach: 200, likes: 50, comments: 4, shares: 2 },
    ]);

    const res = await getProgress();
    expect(res.status).toBe(200);
    const body = await res.json() as { progress: { currentValue: number; percentage: number; onTrack: boolean }[] };
    expect(body.progress).toHaveLength(1);
    // 60 + 50 = 110 likes total, target 100 → 100% (capped)
    expect(body.progress[0].currentValue).toBe(110);
    expect(body.progress[0].percentage).toBe(100);
    expect(body.progress[0].onTrack).toBe(true);
  });

  it("computes progress for AVERAGE aggregation", async () => {
    const mockGoal = {
      id: "goal1",
      userId: "user1",
      name: "Avg likes per post",
      metric: "LIKES",
      targetValue: 50,
      aggregation: "AVERAGE",
      period: "MONTHLY",
      platform: null,
      isActive: true,
    };
    (mockPrisma.engagementGoal.findMany as jest.Mock).mockResolvedValue([mockGoal]);
    (mockPrisma.postInsights.findMany as jest.Mock).mockResolvedValue([
      { impressions: 500, reach: 300, likes: 40, comments: 5, shares: 3 },
      { impressions: 400, reach: 200, likes: 60, comments: 4, shares: 2 },
    ]);

    const res = await getProgress();
    expect(res.status).toBe(200);
    const body = await res.json() as { progress: { currentValue: number; percentage: number; onTrack: boolean }[] };
    // avg = (40 + 60) / 2 = 50
    expect(body.progress[0].currentValue).toBe(50);
    expect(body.progress[0].percentage).toBe(100);
    expect(body.progress[0].onTrack).toBe(true);
  });

  it("returns zero progress when no insights data", async () => {
    const mockGoal = {
      id: "goal1",
      userId: "user1",
      name: "Likes goal",
      metric: "LIKES",
      targetValue: 100,
      aggregation: "AVERAGE",
      period: "DAILY",
      platform: null,
      isActive: true,
    };
    (mockPrisma.engagementGoal.findMany as jest.Mock).mockResolvedValue([mockGoal]);
    (mockPrisma.postInsights.findMany as jest.Mock).mockResolvedValue([]);

    const res = await getProgress();
    expect(res.status).toBe(200);
    const body = await res.json() as { progress: { currentValue: number; percentage: number; onTrack: boolean; sampleSize: number }[] };
    expect(body.progress[0].currentValue).toBe(0);
    expect(body.progress[0].percentage).toBe(0);
    expect(body.progress[0].onTrack).toBe(false);
    expect(body.progress[0].sampleSize).toBe(0);
  });

  it("includes correct response shape", async () => {
    const mockGoal = {
      id: "goal1",
      userId: "user1",
      name: "Weekly comments",
      metric: "COMMENTS",
      targetValue: 20,
      aggregation: "TOTAL",
      period: "WEEKLY",
      platform: "INSTAGRAM",
      isActive: true,
    };
    (mockPrisma.engagementGoal.findMany as jest.Mock).mockResolvedValue([mockGoal]);
    (mockPrisma.postInsights.findMany as jest.Mock).mockResolvedValue([
      { impressions: 100, reach: 50, likes: 10, comments: 8, shares: 2 },
    ]);

    const res = await getProgress();
    const body = await res.json() as { progress: { goalId: string; name: string; metric: string; aggregation: string; period: string; platform: string; targetValue: number; currentValue: number; percentage: number; onTrack: boolean; sampleSize: number }[] };
    const prog = body.progress[0];
    expect(prog.goalId).toBe("goal1");
    expect(prog.name).toBe("Weekly comments");
    expect(prog.metric).toBe("COMMENTS");
    expect(prog.aggregation).toBe("TOTAL");
    expect(prog.period).toBe("WEEKLY");
    expect(prog.platform).toBe("INSTAGRAM");
    expect(prog.targetValue).toBe(20);
    expect(prog.currentValue).toBe(8); // 8 comments
    expect(typeof prog.percentage).toBe("number");
    expect(typeof prog.onTrack).toBe("boolean");
    expect(typeof prog.sampleSize).toBe("number");
  });
});
