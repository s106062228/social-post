jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
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
    followerMilestone: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    socialAccount: {
      findMany: jest.fn(),
    },
  },
}));

import { GET as getMilestones } from "@/app/api/milestones/route";
import { POST as celebrate } from "@/app/api/milestones/[id]/celebrate/route";
import { GET as getGrowth } from "@/app/api/analytics/growth-projection/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { NextRequest } from "next/server";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.followerMilestone.findMany as jest.Mock;
const mockFindUnique = prisma.followerMilestone.findUnique as jest.Mock;
const mockUpdate = prisma.followerMilestone.update as jest.Mock;
const mockAccountFindMany = prisma.socialAccount.findMany as jest.Mock;

const USER_ID = "user1";
const AUTHED = { user: { id: USER_ID } };
const RATE_OK = { success: true };
const RATE_FAIL = { success: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RATE_OK);
});

// ── GET /api/milestones ───────────────────────────────────────────────────────

describe("GET /api/milestones", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getMilestones();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce(RATE_FAIL);
    const res = await getMilestones();
    expect(res.status).toBe(429);
  });

  it("returns empty milestones array", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const res = await getMilestones();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.milestones).toEqual([]);
  });

  it("returns milestones with correct shape", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "m1",
        platform: "INSTAGRAM",
        milestone: 1000,
        achievedAt: new Date("2026-01-01"),
        celebrated: false,
        accountId: "acc1",
        account: { accountName: "My IG" },
      },
    ]);
    const res = await getMilestones();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.milestones).toHaveLength(1);
    expect(body.milestones[0]).toMatchObject({
      id: "m1",
      platform: "INSTAGRAM",
      milestone: 1000,
      celebrated: false,
      accountId: "acc1",
      accountName: "My IG",
    });
  });
});

// ── POST /api/milestones/[id]/celebrate ──────────────────────────────────────

describe("POST /api/milestones/[id]/celebrate", () => {
  const makeReq = () =>
    new NextRequest("http://localhost/api/milestones/m1/celebrate", { method: "POST" });
  const makeParams = (id = "m1") =>
    Promise.resolve({ id });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await celebrate(makeReq(), { params: makeParams() });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce(RATE_FAIL);
    const res = await celebrate(makeReq(), { params: makeParams() });
    expect(res.status).toBe(429);
  });

  it("returns 404 when milestone not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await celebrate(makeReq(), { params: makeParams("missing") });
    expect(res.status).toBe(404);
  });

  it("returns 403 when milestone belongs to another user", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: "other-user" });
    const res = await celebrate(makeReq(), { params: makeParams() });
    expect(res.status).toBe(403);
  });

  it("returns celebrated: true on success", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: USER_ID });
    mockUpdate.mockResolvedValueOnce({ id: "m1", celebrated: true });
    const res = await celebrate(makeReq(), { params: makeParams() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.celebrated).toBe(true);
  });
});

// ── GET /api/analytics/growth-projection ─────────────────────────────────────

describe("GET /api/analytics/growth-projection", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getGrowth();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce(RATE_FAIL);
    const res = await getGrowth();
    expect(res.status).toBe(429);
  });

  it("returns empty accounts array when no accounts", async () => {
    mockAccountFindMany.mockResolvedValueOnce([]);
    const res = await getGrowth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts).toEqual([]);
  });

  it("returns correct projection shape", async () => {
    mockAccountFindMany.mockResolvedValueOnce([
      {
        id: "acc1",
        accountName: "My FB",
        platform: "FACEBOOK",
        audienceMetrics: [
          { followersCount: 900, syncedAt: new Date(Date.now() - 30 * 86400000) },
          { followersCount: 1000, syncedAt: new Date() },
        ],
      },
    ]);
    const res = await getGrowth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts).toHaveLength(1);
    const acc = body.accounts[0];
    expect(acc).toMatchObject({
      accountId: "acc1",
      accountName: "My FB",
      platform: "FACEBOOK",
      currentFollowers: 1000,
    });
    expect(acc.projections).toHaveLength(3);
    expect(acc.projections[0]).toHaveProperty("days");
    expect(acc.projections[0]).toHaveProperty("projected");
    expect(acc.nextMilestone).toBe(2500);
  });
});
