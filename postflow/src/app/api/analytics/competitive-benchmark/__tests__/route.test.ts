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
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/db", () => ({
  prisma: {
    socialAccount: { findMany: jest.fn() },
    competitorAccount: { findMany: jest.fn() },
    publishResult: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { NextRequest } from "next/server";
import { GET } from "../route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockLimiter = apiLimiter as jest.Mock;
const mockSocialAccountFindMany = prisma.socialAccount.findMany as jest.Mock;
const mockCompetitorFindMany = prisma.competitorAccount.findMany as jest.Mock;
const mockPublishResultFindMany = prisma.publishResult.findMany as jest.Mock;

const AUTHED = { user: { id: "user-1" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

function makeReq(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/analytics/competitive-benchmark", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq("http://localhost/api/analytics/competitive-benchmark"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET(makeReq("http://localhost/api/analytics/competitive-benchmark"));
    expect(res.status).toBe(429);
  });

  it("returns empty platforms when no data", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockSocialAccountFindMany.mockResolvedValue([]);
    mockCompetitorFindMany.mockResolvedValue([]);
    mockPublishResultFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/analytics/competitive-benchmark"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.platforms).toEqual([]);
  });

  it("groups user accounts by platform", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockSocialAccountFindMany.mockResolvedValue([
      {
        id: "acc-1",
        platform: "INSTAGRAM",
        accountName: "My Instagram",
        audienceMetrics: [{ followersCount: 5000, syncedAt: new Date() }],
      },
    ]);
    mockCompetitorFindMany.mockResolvedValue([]);
    mockPublishResultFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/analytics/competitive-benchmark"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.platforms).toHaveLength(1);
    expect(body.platforms[0].platform).toBe("INSTAGRAM");
    expect(body.platforms[0].userAccounts).toHaveLength(1);
    expect(body.platforms[0].userAccounts[0].accountName).toBe("My Instagram");
    expect(body.platforms[0].userAccounts[0].followersCount).toBe(5000);
  });

  it("groups competitors by platform", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockSocialAccountFindMany.mockResolvedValue([]);
    mockCompetitorFindMany.mockResolvedValue([
      {
        id: "comp-1",
        platform: "INSTAGRAM",
        name: "Competitor A",
        handle: "@compA",
        profileUrl: null,
        snapshots: [
          {
            followersCount: 10000,
            avgEngagementRate: 3.5,
            postsPerWeek: 7,
            avgLikes: 200,
            avgComments: 30,
          },
        ],
      },
    ]);
    mockPublishResultFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/analytics/competitive-benchmark"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.platforms).toHaveLength(1);
    expect(body.platforms[0].competitors).toHaveLength(1);
    expect(body.platforms[0].competitors[0].name).toBe("Competitor A");
    expect(body.platforms[0].competitors[0].followersCount).toBe(10000);
  });

  it("computes bestFollowers as max across user + competitor", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockSocialAccountFindMany.mockResolvedValue([
      {
        id: "acc-1",
        platform: "INSTAGRAM",
        accountName: "My Instagram",
        audienceMetrics: [{ followersCount: 3000, syncedAt: new Date() }],
      },
    ]);
    mockCompetitorFindMany.mockResolvedValue([
      {
        id: "comp-1",
        platform: "INSTAGRAM",
        name: "Competitor A",
        handle: "@compA",
        profileUrl: null,
        snapshots: [
          { followersCount: 10000, avgEngagementRate: 3.5, postsPerWeek: 7, avgLikes: 200, avgComments: 30 },
        ],
      },
    ]);
    mockPublishResultFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/analytics/competitive-benchmark"));
    const body = await res.json();
    expect(body.platforms[0].bestFollowers).toBe(10000);
  });

  it("merges platforms from user accounts and competitors", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockSocialAccountFindMany.mockResolvedValue([
      {
        id: "acc-1",
        platform: "TWITTER",
        accountName: "My Twitter",
        audienceMetrics: [],
      },
    ]);
    mockCompetitorFindMany.mockResolvedValue([
      {
        id: "comp-1",
        platform: "INSTAGRAM",
        name: "Competitor A",
        handle: "@compA",
        profileUrl: null,
        snapshots: [],
      },
    ]);
    mockPublishResultFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/analytics/competitive-benchmark"));
    const body = await res.json();
    const platforms = body.platforms.map((p: { platform: string }) => p.platform);
    expect(platforms).toContain("TWITTER");
    expect(platforms).toContain("INSTAGRAM");
  });

  it("computes user avgEngagementRate from publish results", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockSocialAccountFindMany.mockResolvedValue([
      {
        id: "acc-1",
        platform: "INSTAGRAM",
        accountName: "My Instagram",
        audienceMetrics: [],
      },
    ]);
    mockCompetitorFindMany.mockResolvedValue([]);
    // 2 publish results with insights: engagement/reach
    mockPublishResultFindMany.mockResolvedValue([
      {
        accountId: "acc-1",
        platform: "INSTAGRAM",
        insights: { likes: 100, comments: 20, shares: 10, reach: 1000 },
      },
      {
        accountId: "acc-1",
        platform: "INSTAGRAM",
        insights: { likes: 50, comments: 10, shares: 5, reach: 500 },
      },
    ]);
    const res = await GET(makeReq("http://localhost/api/analytics/competitive-benchmark"));
    const body = await res.json();
    // Both results: (130/1000 + 65/500) * 100 / 2 = (13 + 13) / 2 = 13
    expect(body.platforms[0].userAccounts[0].avgEngagementRate).toBeCloseTo(13, 0);
  });

  it("handles competitor with no snapshots gracefully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockSocialAccountFindMany.mockResolvedValue([]);
    mockCompetitorFindMany.mockResolvedValue([
      {
        id: "comp-1",
        platform: "INSTAGRAM",
        name: "Competitor A",
        handle: "@compA",
        profileUrl: null,
        snapshots: [],
      },
    ]);
    mockPublishResultFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/analytics/competitive-benchmark"));
    const body = await res.json();
    expect(body.platforms[0].competitors[0].followersCount).toBeNull();
    expect(body.platforms[0].bestFollowers).toBeNull();
  });
});
