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
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
  PublishStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PUBLISHED: "PUBLISHED",
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

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findMany: jest.fn() },
    postingGoal: { findMany: jest.fn() },
    publishResult: { count: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/planner/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockGoalFindMany = prisma.postingGoal.findMany as jest.Mock;
const mockPublishResultCount = prisma.publishResult.count as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED = { user: { id: MOCK_USER_ID, email: "u@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeReq(params?: Record<string, string>): NextRequest {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return new NextRequest(`http://localhost/api/planner${qs}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPostFindMany.mockResolvedValue([]);
  mockGoalFindMany.mockResolvedValue([]);
  mockPublishResultCount.mockResolvedValue(0);
});

// ── Auth & rate-limit guards ──────────────────────────────────────────────────

test("returns 401 when unauthenticated", async () => {
  mockAuth.mockResolvedValue(null);
  const res = await GET(makeReq());
  expect(res.status).toBe(401);
  const body = await res.json() as { error: string };
  expect(body.error).toBe("Unauthorized");
});

test("returns 429 when rate limited", async () => {
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_FAIL);
  const res = await GET(makeReq());
  expect(res.status).toBe(429);
});

// ── Response shape ────────────────────────────────────────────────────────────

test("returns 7 days in the response", async () => {
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);

  const res = await GET(makeReq());
  expect(res.status).toBe(200);
  const body = await res.json() as { days: unknown[] };
  expect(body.days).toHaveLength(7);
});

test("response includes weekStart and weekEnd", async () => {
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);

  const res = await GET(makeReq({ weekOf: "2026-05-14" }));
  const body = await res.json() as { weekStart: string; weekEnd: string };
  // 2026-05-14 is a Thursday; Mon of that week = 2026-05-11, Sun = 2026-05-17
  expect(body.weekStart).toBe("2026-05-11");
  expect(body.weekEnd).toBe("2026-05-17");
});

test("each day has required fields", async () => {
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);

  const res = await GET(makeReq({ weekOf: "2026-05-11" }));
  const body = await res.json() as {
    days: { date: string; dayOfWeek: string; posts: unknown[]; dailyGoal: unknown; weeklyGoal: unknown }[]
  };
  for (const day of body.days) {
    expect(typeof day.date).toBe("string");
    expect(typeof day.dayOfWeek).toBe("string");
    expect(Array.isArray(day.posts)).toBe(true);
    expect("dailyGoal" in day).toBe(true);
    expect("weeklyGoal" in day).toBe(true);
  }
});

test("days are ordered Mon–Sun", async () => {
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);

  const res = await GET(makeReq({ weekOf: "2026-05-11" }));
  const body = await res.json() as { days: { dayOfWeek: string }[] };
  const names = body.days.map((d) => d.dayOfWeek);
  expect(names).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
});

// ── Posts bucketing ───────────────────────────────────────────────────────────

test("posts are placed in the correct day bucket", async () => {
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);

  const wednesdayPost = {
    id: "post_wed",
    content: "Wednesday post",
    status: "SCHEDULED",
    mediaType: "NONE",
    scheduledAt: new Date("2026-05-13T10:00:00Z"),
    publishResults: [{ platform: "FACEBOOK" }],
  };
  mockPostFindMany.mockResolvedValue([wednesdayPost]);

  const res = await GET(makeReq({ weekOf: "2026-05-11" }));
  const body = await res.json() as {
    days: { date: string; dayOfWeek: string; posts: { id: string }[] }[]
  };

  const wednesday = body.days.find((d) => d.dayOfWeek === "Wednesday");
  expect(wednesday?.posts).toHaveLength(1);
  expect(wednesday?.posts[0].id).toBe("post_wed");

  const monday = body.days.find((d) => d.dayOfWeek === "Monday");
  expect(monday?.posts).toHaveLength(0);
});

// ── Goal summaries ────────────────────────────────────────────────────────────

test("dailyGoal is null when no active daily goals exist", async () => {
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);
  mockGoalFindMany.mockResolvedValue([]); // no goals

  const res = await GET(makeReq({ weekOf: "2026-05-11" }));
  const body = await res.json() as { days: { dailyGoal: unknown }[] };
  for (const day of body.days) {
    expect(day.dailyGoal).toBeNull();
  }
});

test("dailyGoal is populated when an active daily goal exists", async () => {
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);
  mockGoalFindMany.mockResolvedValue([
    { id: "goal1", period: "DAILY", targetCount: 3, platform: null },
  ]);
  mockPublishResultCount.mockResolvedValue(2);

  const res = await GET(makeReq({ weekOf: "2026-05-11" }));
  const body = await res.json() as {
    days: { dailyGoal: { target: number; achieved: number; onTrack: boolean } | null }[]
  };
  const monday = body.days[0];
  expect(monday.dailyGoal).not.toBeNull();
  expect(monday.dailyGoal?.target).toBe(3);
  expect(monday.dailyGoal?.achieved).toBe(2);
  expect(monday.dailyGoal?.onTrack).toBe(false);
});

test("weeklyGoal is populated when an active weekly goal exists", async () => {
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);
  mockGoalFindMany.mockResolvedValue([
    { id: "goal2", period: "WEEKLY", targetCount: 10, platform: null },
  ]);
  // First call is for weekly published count, rest are daily per-day counts
  mockPublishResultCount
    .mockResolvedValueOnce(7)  // weekly total
    .mockResolvedValue(1);     // per-day (no daily goal, so unused)

  const res = await GET(makeReq({ weekOf: "2026-05-11" }));
  const body = await res.json() as {
    days: { weeklyGoal: { target: number; achieved: number; onTrack: boolean } | null }[]
  };
  // weeklyGoal should be same on every day
  const monday = body.days[0];
  expect(monday.weeklyGoal).not.toBeNull();
  expect(monday.weeklyGoal?.target).toBe(10);
  expect(monday.weeklyGoal?.achieved).toBe(7);
  expect(monday.weeklyGoal?.onTrack).toBe(false);
});

// ── Edge cases ────────────────────────────────────────────────────────────────

test("invalid weekOf param falls back gracefully and returns 7 days", async () => {
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);

  const res = await GET(makeReq({ weekOf: "not-a-date" }));
  expect(res.status).toBe(200);
  const body = await res.json() as { days: unknown[] };
  expect(body.days).toHaveLength(7);
});
