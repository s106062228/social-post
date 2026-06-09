// ── Mocks (must come before all imports) ─────────────────────────────────────

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  PostStatus: { DRAFT: "DRAFT", SCHEDULED: "SCHEDULED", PUBLISHED: "PUBLISHED", FAILED: "FAILED", PUBLISHING: "PUBLISHING" },
  PublishStatus: { PENDING: "PENDING", PROCESSING: "PROCESSING", PUBLISHED: "PUBLISHED", FAILED: "FAILED" },
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) { super(msg); this.code = opts.code; }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/activity-log", () => ({ logActivity: jest.fn() }));

// ── Imports ───────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/optimize-schedule/route";
import type { OptimizeScheduleResponse } from "@/app/api/posts/optimize-schedule/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import {
  optimizeSchedule,
  parseDayName,
  parseHourLabel,
} from "@/lib/schedule-optimizer";
import type { PostData } from "@/lib/correlation";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/posts/optimize-schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Build a PostData entry for a given UTC day (0=Sun) and hour */
function makePostData(dayOfWeek: number, hour: number, engagement = 10): PostData {
  // Find a date that falls on the given UTC day
  // 2026-04-06 is Monday (day 1). So we adjust.
  const base = new Date("2026-04-06T00:00:00Z"); // Monday
  const diff = (dayOfWeek - 1 + 7) % 7;
  const d = new Date(base.getTime() + diff * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return {
    content: "Sample post",
    mediaType: "NONE",
    contentCategory: null,
    publishedAt: d,
    totalEngagement: engagement,
  };
}

// ── Utility unit tests ────────────────────────────────────────────────────────

describe("parseDayName", () => {
  it("maps Sunday to 0", () => expect(parseDayName("Sunday")).toBe(0));
  it("maps Tuesday to 2", () => expect(parseDayName("Tuesday")).toBe(2));
  it("returns -1 for unknown", () => expect(parseDayName("Holiday")).toBe(-1));
});

describe("parseHourLabel", () => {
  it("parses 12am as 0", () => expect(parseHourLabel("12am")).toBe(0));
  it("parses 9am as 9", () => expect(parseHourLabel("9am")).toBe(9));
  it("parses 12pm as 12", () => expect(parseHourLabel("12pm")).toBe(12));
  it("parses 3pm as 15", () => expect(parseHourLabel("3pm")).toBe(15));
  it("parses 11pm as 23", () => expect(parseHourLabel("11pm")).toBe(23));
  it("returns -1 for unknown", () => expect(parseHourLabel("noon")).toBe(-1));
});

describe("optimizeSchedule utility", () => {
  it("returns empty when no scheduled posts", () => {
    const history = Array.from({ length: 6 }, () => makePostData(2, 10, 100));
    expect(optimizeSchedule([], history)).toHaveLength(0);
  });

  it("returns empty when fewer than 5 historical posts", () => {
    const now = new Date();
    const future = new Date(now.getTime() + 3 * 86_400_000);
    future.setUTCHours(8, 0, 0, 0);
    const scheduled = [
      { id: "p1", scheduledAt: future, content: "x", mediaType: "NONE", contentCategory: null },
    ];
    const history = Array.from({ length: 4 }, () => makePostData(2, 10, 100));
    expect(optimizeSchedule(scheduled, history)).toHaveLength(0);
  });

  it("returns empty when no day/hour correlation exceeds threshold", () => {
    const now = new Date();
    const future = new Date(now.getTime() + 3 * 86_400_000);
    future.setUTCHours(8, 0, 0, 0);
    const scheduled = [
      { id: "p1", scheduledAt: future, content: "x", mediaType: "NONE", contentCategory: null },
    ];
    // All posts same engagement → no significant multiplier
    const history = [
      makePostData(0, 8, 10),
      makePostData(1, 8, 10),
      makePostData(2, 8, 10),
      makePostData(3, 8, 10),
      makePostData(4, 8, 10),
      makePostData(5, 8, 10),
      makePostData(6, 8, 10),
    ];
    expect(optimizeSchedule(scheduled, history)).toHaveLength(0);
  });

  it("suggests a move when Tuesday has much higher engagement", () => {
    const now = new Date();
    // Scheduled on a Sunday
    const sunday = new Date(now.getTime() + 2 * 86_400_000);
    // Move to next Sunday UTC
    while (sunday.getUTCDay() !== 0) {
      sunday.setUTCDate(sunday.getUTCDate() + 1);
    }
    sunday.setUTCHours(8, 0, 0, 0);

    const scheduled = [
      { id: "p1", scheduledAt: new Date(sunday), content: "test", mediaType: "NONE", contentCategory: null },
    ];

    // 6 Tuesday posts with high engagement + 6 Sunday posts with low engagement
    const history: PostData[] = [];
    for (let i = 0; i < 6; i++) {
      history.push(makePostData(2, 10, 100)); // Tuesday high
    }
    for (let i = 0; i < 6; i++) {
      history.push(makePostData(0, 10, 5)); // Sunday low
    }

    const proposals = optimizeSchedule(scheduled, history, { windowDays: 30 });
    expect(proposals.length).toBeGreaterThan(0);
    const proposal = proposals[0];
    expect(proposal.postId).toBe("p1");
    expect(proposal.improvementFactor).toBeGreaterThanOrEqual(1.2);
    expect(proposal.reason).toContain("Tuesday");
  });

  it("proposal proposedScheduledAt is after now", () => {
    const now = new Date();
    const monday = new Date(now.getTime() + 7 * 86_400_000);
    while (monday.getUTCDay() !== 1) {
      monday.setUTCDate(monday.getUTCDate() + 1);
    }
    monday.setUTCHours(6, 0, 0, 0);

    const scheduled = [
      { id: "p1", scheduledAt: new Date(monday), content: "test", mediaType: "NONE", contentCategory: null },
    ];

    const history: PostData[] = [];
    for (let i = 0; i < 6; i++) history.push(makePostData(3, 14, 200)); // Wednesday 2pm
    for (let i = 0; i < 6; i++) history.push(makePostData(1, 6, 5)); // Monday 6am

    const proposals = optimizeSchedule(scheduled, history, { windowDays: 30 });
    for (const p of proposals) {
      expect(p.proposedScheduledAt.getTime()).toBeGreaterThan(Date.now());
    }
  });
});

// ── API Route tests ───────────────────────────────────────────────────────────

describe("POST /api/posts/optimize-schedule", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  it("returns 400 for invalid windowDays", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ windowDays: 0 }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid request");
  });

  it("returns empty proposals when no scheduled posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany
      .mockResolvedValueOnce([]) // scheduled posts
      .mockResolvedValueOnce([]); // historical posts

    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as OptimizeScheduleResponse;
    expect(data.proposals).toHaveLength(0);
    expect(data.totalScheduled).toBe(0);
    expect(data.dryRun).toBe(true);
  });

  it("returns empty proposals when no historical data", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const future = new Date(Date.now() + 7 * 86_400_000);
    mockFindMany
      .mockResolvedValueOnce([
        { id: "p1", scheduledAt: future, content: "test", mediaType: "NONE", contentCategory: null },
      ])
      .mockResolvedValueOnce([]); // no historical

    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as OptimizeScheduleResponse;
    expect(data.proposals).toHaveLength(0);
    expect(data.totalScheduled).toBe(1);
  });

  it("returns correct response shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as OptimizeScheduleResponse;
    expect(data).toHaveProperty("proposals");
    expect(data).toHaveProperty("totalScheduled");
    expect(data).toHaveProperty("optimized");
    expect(data).toHaveProperty("dryRun");
    expect(Array.isArray(data.proposals)).toBe(true);
  });

  it("dryRun defaults to true and optimized=0", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await POST(makeRequest({})); // no dryRun field
    const data = (await res.json()) as OptimizeScheduleResponse;
    expect(data.dryRun).toBe(true);
    expect(data.optimized).toBe(0);
  });

  it("applies changes and returns optimized count when dryRun=false", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    // Empty scheduled and historical → no proposals → optimized=0
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockTransaction.mockResolvedValueOnce([]);

    const res = await POST(makeRequest({ dryRun: false }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as OptimizeScheduleResponse;
    expect(data.dryRun).toBe(false);
    expect(data.optimized).toBe(0); // no proposals to apply
    // $transaction should NOT be called since no proposals
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 500 on DB error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB down"));

    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Internal server error");
  });
});
