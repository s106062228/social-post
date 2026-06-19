import { NextRequest } from "next/server";
import { detectCalendarGaps } from "@/lib/calendar-gaps";
import type { CalendarGapResult } from "@/lib/calendar-gaps";

// ── Unit tests for detectCalendarGaps utility ─────────────────────────────────

describe("detectCalendarGaps utility", () => {
  function makeTomorrow(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  function dateAtOffset(offsetDays: number): Date {
    const d = makeTomorrow();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d;
  }

  it("returns all days as gaps when no posts are scheduled", () => {
    const result = detectCalendarGaps([], 7);
    expect(result.totalGaps).toBe(7);
    expect(result.coveredDays).toBe(0);
    expect(result.analyzedDays).toBe(7);
    expect(result.gaps).toHaveLength(7);
  });

  it("returns zero gaps when all days are covered", () => {
    const posts = Array.from({ length: 5 }, (_, i) => ({
      scheduledAt: dateAtOffset(i),
    }));
    const result = detectCalendarGaps(posts, 5);
    expect(result.totalGaps).toBe(0);
    expect(result.coveredDays).toBe(5);
    expect(result.gaps).toHaveLength(0);
  });

  it("detects a single gap in the middle of covered days", () => {
    // Cover day 0, 1, skip day 2, cover day 3, 4
    const posts = [
      { scheduledAt: dateAtOffset(0) },
      { scheduledAt: dateAtOffset(1) },
      { scheduledAt: dateAtOffset(3) },
      { scheduledAt: dateAtOffset(4) },
    ];
    const result = detectCalendarGaps(posts, 5);
    expect(result.totalGaps).toBe(1);
    expect(result.coveredDays).toBe(4);
    const gapDate = dateAtOffset(2).toISOString().slice(0, 10);
    expect(result.gaps[0]!.date).toBe(gapDate);
  });

  it("marks weekend days correctly", () => {
    const result = detectCalendarGaps([], 14);
    for (const gap of result.gaps) {
      const isWeekend = gap.dayOfWeek === 0 || gap.dayOfWeek === 6;
      expect(gap.isWeekend).toBe(isWeekend);
    }
  });

  it("computes longestStreakDays for a run of gaps", () => {
    // Cover only day 0; days 1–4 are gaps (streak of 4)
    const posts = [{ scheduledAt: dateAtOffset(0) }];
    const result = detectCalendarGaps(posts, 5);
    expect(result.longestStreakDays).toBe(4);
  });

  it("resets streak counter when a covered day breaks the gap sequence", () => {
    // gaps: day 0,1 (streak 2), covered day 2, gaps: day 3,4,5 (streak 3)
    const posts = [{ scheduledAt: dateAtOffset(2) }];
    const result = detectCalendarGaps(posts, 6);
    expect(result.longestStreakDays).toBe(3);
  });

  it("computes gapRate as a 0-100 integer", () => {
    // 3 gaps out of 6 days = 50%
    const posts = [
      { scheduledAt: dateAtOffset(0) },
      { scheduledAt: dateAtOffset(2) },
      { scheduledAt: dateAtOffset(4) },
    ];
    const result = detectCalendarGaps(posts, 6);
    expect(result.gapRate).toBe(50);
  });

  it("ignores posts with null scheduledAt", () => {
    const posts = [
      { scheduledAt: null },
      { scheduledAt: dateAtOffset(0) },
    ];
    const result = detectCalendarGaps(posts, 3);
    // day 0 covered, days 1 and 2 are gaps
    expect(result.coveredDays).toBe(1);
    expect(result.totalGaps).toBe(2);
  });

  it("sets hoursEmpty to 24 for each gap", () => {
    const result = detectCalendarGaps([], 3);
    for (const gap of result.gaps) {
      expect(gap.hoursEmpty).toBe(24);
    }
  });
});

// ── Integration tests for GET /api/analytics/calendar-gaps ───────────────────

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn(() =>
    new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  ),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { GET } from "@/app/api/analytics/calendar-gaps/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockRl = apiLimiter as jest.MockedFunction<typeof apiLimiter>;

const rlAllow = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const rlDeny = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

function makeReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/analytics/calendar-gaps");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as never);
  (mockRl as jest.Mock).mockResolvedValue(rlAllow);
  (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/analytics/calendar-gaps", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    (mockRl as jest.Mock).mockResolvedValue(rlDeny);
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
  });

  it("returns 400 for an invalid windowDays value", async () => {
    const res = await GET(makeReq({ windowDays: "0" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with valid shape when no posts are scheduled", async () => {
    const res = await GET(makeReq({ windowDays: "7" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as CalendarGapResult & { windowDays: number };
    expect(body.windowDays).toBe(7);
    expect(body.totalGaps).toBe(7);
    expect(body.coveredDays).toBe(0);
    expect(body.analyzedDays).toBe(7);
    expect(typeof body.gapRate).toBe("number");
    expect(Array.isArray(body.gaps)).toBe(true);
    expect(typeof body.longestStreakDays).toBe("number");
  });
});
