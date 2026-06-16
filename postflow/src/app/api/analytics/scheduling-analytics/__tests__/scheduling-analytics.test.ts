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

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/scheduling-analytics/route";
import type { SchedulingAnalyticsResponse } from "@/app/api/analytics/scheduling-analytics/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "cltest000000000000000001";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/scheduling-analytics${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function makePost(overrides: {
  status?: string;
  scheduledAt?: Date | null;
  createdAt?: Date;
  publishResults?: { platform: string }[];
}) {
  return {
    status: "SCHEDULED",
    scheduledAt: new Date("2025-01-15T10:00:00Z"),
    createdAt: new Date("2025-01-14T08:00:00Z"),
    publishResults: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/scheduling-analytics", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(400);
  });

  it("returns zeros for empty state when no posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as SchedulingAnalyticsResponse;

    expect(data.occupancyRate).toBe(0);
    expect(data.avgPostsPerActiveDay).toBe(0);
    expect(data.totalScheduled).toBe(0);
    expect(data.totalPublished).toBe(0);
    expect(data.avgLeadTimeDays).toBeNull();
    expect(data.platformBalance).toHaveLength(0);
  });

  it("echoes back the requested period", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ period: "90d" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as SchedulingAnalyticsResponse;
    expect(data.period).toBe("90d");
  });

  it("defaults to 30d when no period param", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as SchedulingAnalyticsResponse;
    expect(data.period).toBe("30d");
  });

  it("returns dayDistribution with exactly 7 entries (Sun–Sat)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([makePost({})]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as SchedulingAnalyticsResponse;

    expect(data.dayDistribution).toHaveLength(7);
    const dayNames = data.dayDistribution.map((d) => d.dayName);
    expect(dayNames).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    for (const entry of data.dayDistribution) {
      expect(typeof entry.count).toBe("number");
      expect(entry.count).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns hourDistribution with exactly 24 entries (0–23)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([makePost({})]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as SchedulingAnalyticsResponse;

    expect(data.hourDistribution).toHaveLength(24);
    for (let h = 0; h < 24; h++) {
      expect(data.hourDistribution[h].hour).toBe(h);
      expect(typeof data.hourDistribution[h].count).toBe("number");
      expect(data.hourDistribution[h].count).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps occupancyRate within 0–100 bounds", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    // Many posts on the same day should not push occupancy above 100
    const manyPosts = Array.from({ length: 50 }, () =>
      makePost({ scheduledAt: new Date("2025-01-15T10:00:00Z") })
    );
    mockFindMany.mockResolvedValueOnce(manyPosts);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as SchedulingAnalyticsResponse;

    expect(data.occupancyRate).toBeGreaterThanOrEqual(0);
    expect(data.occupancyRate).toBeLessThanOrEqual(100);
  });

  it("returns correct response shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([
      makePost({
        status: "SCHEDULED",
        scheduledAt: new Date("2025-06-10T14:00:00Z"),
        createdAt: new Date("2025-06-08T09:00:00Z"),
        publishResults: [{ platform: "FACEBOOK" }, { platform: "INSTAGRAM" }],
      }),
      makePost({
        status: "PUBLISHED",
        scheduledAt: new Date("2025-06-11T08:00:00Z"),
        createdAt: new Date("2025-06-09T07:00:00Z"),
        publishResults: [{ platform: "FACEBOOK" }],
      }),
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as SchedulingAnalyticsResponse;

    expect(data).toHaveProperty("period");
    expect(data).toHaveProperty("occupancyRate");
    expect(data).toHaveProperty("avgPostsPerActiveDay");
    expect(data).toHaveProperty("dayDistribution");
    expect(data).toHaveProperty("hourDistribution");
    expect(data).toHaveProperty("avgLeadTimeDays");
    expect(data).toHaveProperty("platformBalance");
    expect(data).toHaveProperty("totalScheduled");
    expect(data).toHaveProperty("totalPublished");

    expect(data.totalScheduled).toBe(1);
    expect(data.totalPublished).toBe(1);
    // FACEBOOK appears in both posts' publishResults (2+1=3), INSTAGRAM once
    const fbEntry = data.platformBalance.find((p) => p.platform === "FACEBOOK");
    expect(fbEntry).toBeDefined();
    // FACEBOOK appears in both posts' publishResults: 1 + 1 = 2
    expect(fbEntry?.count).toBe(2);
    const igEntry = data.platformBalance.find((p) => p.platform === "INSTAGRAM");
    expect(igEntry).toBeDefined();
    expect(igEntry?.count).toBe(1);
    // platformBalance sorted by count desc
    expect(data.platformBalance[0].count).toBeGreaterThanOrEqual(data.platformBalance[1]?.count ?? 0);
  });
});
