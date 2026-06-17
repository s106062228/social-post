import { GET } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  httpLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
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
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, opts: { code: string; clientVersion: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: { socialAccount: { findMany: jest.fn() } },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockFindMany = prisma.socialAccount.findMany as jest.MockedFunction<
  typeof prisma.socialAccount.findMany
>;
const mockApiLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;

const AUTHED = { user: { id: "user-1", email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/analytics/growth-velocity");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

function makeDate(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED as Awaited<ReturnType<typeof auth>>);
  mockApiLimiter.mockResolvedValue(RL_OK as Awaited<ReturnType<typeof apiLimiter>>);
  mockFindMany.mockResolvedValue([]);
});

describe("GET /api/analytics/growth-velocity", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL as Awaited<ReturnType<typeof apiLimiter>>);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    const res = await GET(makeRequest({ period: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with empty accounts when no social accounts exist", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.period).toBe("30d");
    expect(body.periodDays).toBe(30);
    expect(Array.isArray(body.accounts)).toBe(true);
    expect((body.accounts as unknown[]).length).toBe(0);
    expect(body.fleetMomentumScore).toBe(0);
    expect(body.topMomentumAccount).toBeNull();
  });

  it("echoes the period and computes periodDays", async () => {
    const res = await GET(makeRequest({ period: "90d" }));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.period).toBe("90d");
    expect(body.periodDays).toBe(90);
  });

  it("computes follower velocity from two metrics", async () => {
    const now = new Date();
    const earlier = makeDate(10);
    mockFindMany.mockResolvedValue([
      {
        id: "acct-1",
        accountName: "TestAccount",
        platform: "INSTAGRAM",
        audienceMetrics: [
          { followersCount: 1000, syncedAt: earlier },
          { followersCount: 1100, syncedAt: now },
        ],
        publishResults: [],
      },
    ] as Awaited<ReturnType<typeof prisma.socialAccount.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    const accounts = body.accounts as Record<string, unknown>[];
    expect(accounts.length).toBe(1);
    expect(accounts[0].currentFollowers).toBe(1100);
    expect(accounts[0].followerGainTotal).toBe(100);
    expect(typeof accounts[0].followerVelocityPerDay).toBe("number");
    expect((accounts[0].followerVelocityPerDay as number)).toBeGreaterThan(0);
  });

  it("returns Insufficient Data label when only one metric exists", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "acct-1",
        accountName: "Solo",
        platform: "FACEBOOK",
        audienceMetrics: [
          { followersCount: 500, syncedAt: new Date() },
        ],
        publishResults: [],
      },
    ] as Awaited<ReturnType<typeof prisma.socialAccount.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    const accounts = body.accounts as Record<string, unknown>[];
    expect(accounts[0].momentumLabel).toBe("Insufficient Data");
    expect(accounts[0].currentFollowers).toBe(500);
  });

  it("computes positive follower acceleration when growth is accelerating", async () => {
    // 4 data points: first half slower, second half faster
    const t0 = makeDate(28);
    const t1 = makeDate(21);
    const t2 = makeDate(14);
    const t3 = makeDate(0);
    mockFindMany.mockResolvedValue([
      {
        id: "acct-1",
        accountName: "Accel",
        platform: "TWITTER",
        audienceMetrics: [
          { followersCount: 1000, syncedAt: t0 },
          { followersCount: 1010, syncedAt: t1 }, // first half: +10 over 7d = ~1.4/d
          { followersCount: 1060, syncedAt: t2 }, // second half starts
          { followersCount: 1200, syncedAt: t3 }, // second half: +140 over 14d = ~10/d
        ],
        publishResults: [],
      },
    ] as Awaited<ReturnType<typeof prisma.socialAccount.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    const accounts = body.accounts as Record<string, unknown>[];
    expect(accounts[0].followerAcceleration).not.toBeNull();
    expect(accounts[0].followerAcceleration as number).toBeGreaterThan(0);
  });

  it("assigns Rising label for high momentum score", async () => {
    const t0 = makeDate(29);
    const t1 = makeDate(0);
    mockFindMany.mockResolvedValue([
      {
        id: "acct-1",
        accountName: "FastGrow",
        platform: "INSTAGRAM",
        audienceMetrics: [
          { followersCount: 1000, syncedAt: t0 },
          { followersCount: 1500, syncedAt: t1 }, // ~17/day velocity → high score
        ],
        publishResults: [],
      },
    ] as Awaited<ReturnType<typeof prisma.socialAccount.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    const accounts = body.accounts as Record<string, unknown>[];
    // Velocity ~17/day → velocityScore ~50, accelScore=25(neutral), engScore=12.5(neutral) → ~87
    expect(accounts[0].momentumScore).toBeGreaterThanOrEqual(60);
    expect(accounts[0].momentumLabel).toBe("Rising");
  });

  it("computes fleetMomentumScore as average of accounts with sufficient data", async () => {
    const t0 = makeDate(10);
    const t1 = makeDate(0);
    mockFindMany.mockResolvedValue([
      {
        id: "acct-1",
        accountName: "AccountA",
        platform: "FACEBOOK",
        audienceMetrics: [
          { followersCount: 1000, syncedAt: t0 },
          { followersCount: 1050, syncedAt: t1 },
        ],
        publishResults: [],
      },
      {
        id: "acct-2",
        accountName: "AccountB",
        platform: "TWITTER",
        audienceMetrics: [
          { followersCount: 2000, syncedAt: t0 },
          { followersCount: 2100, syncedAt: t1 },
        ],
        publishResults: [],
      },
      {
        id: "acct-3",
        accountName: "AccountC",
        platform: "THREADS",
        audienceMetrics: [{ followersCount: 100, syncedAt: new Date() }], // insufficient
        publishResults: [],
      },
    ] as Awaited<ReturnType<typeof prisma.socialAccount.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    const accounts = body.accounts as Record<string, unknown>[];
    // fleetMomentumScore should be average of acct-1 and acct-2 scores (acct-3 excluded)
    const scoreA = accounts.find((a) => a.accountName === "AccountA")?.momentumScore as number;
    const scoreB = accounts.find((a) => a.accountName === "AccountB")?.momentumScore as number;
    const expected = Math.round((scoreA + scoreB) / 2);
    expect(body.fleetMomentumScore).toBe(expected);
  });

  it("identifies topMomentumAccount as the account with the highest score", async () => {
    const t0 = makeDate(10);
    const t1 = makeDate(0);
    mockFindMany.mockResolvedValue([
      {
        id: "acct-1",
        accountName: "SlowAccount",
        platform: "FACEBOOK",
        audienceMetrics: [
          { followersCount: 1000, syncedAt: t0 },
          { followersCount: 1001, syncedAt: t1 }, // very slow growth
        ],
        publishResults: [],
      },
      {
        id: "acct-2",
        accountName: "FastAccount",
        platform: "INSTAGRAM",
        audienceMetrics: [
          { followersCount: 1000, syncedAt: t0 },
          { followersCount: 2000, syncedAt: t1 }, // rapid growth
        ],
        publishResults: [],
      },
    ] as Awaited<ReturnType<typeof prisma.socialAccount.findMany>>);

    const res = await GET(makeRequest());
    const body = await res.json() as Record<string, unknown>;
    expect(body.topMomentumAccount).toBe("FastAccount");
  });

  it("returns 500 on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
