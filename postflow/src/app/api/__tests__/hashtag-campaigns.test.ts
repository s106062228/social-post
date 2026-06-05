jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
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
    hashtagCampaign: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listCampaigns, POST as createCampaign } from "@/app/api/hashtag-campaigns/route";
import {
  PATCH as updateCampaign,
  DELETE as deleteCampaign,
} from "@/app/api/hashtag-campaigns/[id]/route";
import { GET as getPerformance } from "@/app/api/hashtag-campaigns/[id]/performance/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.hashtagCampaign.findMany as jest.Mock;
const mockFindFirst = prisma.hashtagCampaign.findFirst as jest.Mock;
const mockCount = prisma.hashtagCampaign.count as jest.Mock;
const mockCreate = prisma.hashtagCampaign.create as jest.Mock;
const mockUpdate = prisma.hashtagCampaign.update as jest.Mock;
const mockDelete = prisma.hashtagCampaign.delete as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "cltest0000000user000001";
const OTHER_USER_ID = "cltest0000000user000002";
const CAMPAIGN_ID = "cltest0000000camp000001";

const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_CAMPAIGN = {
  id: CAMPAIGN_ID,
  userId: MOCK_USER_ID,
  name: "Summer Sale",
  hashtags: ["summersale", "deals"],
  startDate: new Date("2026-06-01T00:00:00.000Z"),
  endDate: new Date("2026-08-31T00:00:00.000Z"),
  targetPlatforms: ["FACEBOOK", "INSTAGRAM"],
  goal: "Reach 100k impressions",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── GET /api/hashtag-campaigns ────────────────────────────────────────────────

describe("GET /api/hashtag-campaigns", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost:3000/api/hashtag-campaigns");
    const res = await listCampaigns(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const req = new NextRequest("http://localhost:3000/api/hashtag-campaigns");
    const res = await listCampaigns(req);
    expect(res.status).toBe(429);
  });

  it("returns empty list when no campaigns", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    const req = new NextRequest("http://localhost:3000/api/hashtag-campaigns");
    const res = await listCampaigns(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { campaigns: unknown[] };
    expect(data.campaigns).toHaveLength(0);
  });

  it("returns campaigns with expected shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_CAMPAIGN]);
    const req = new NextRequest("http://localhost:3000/api/hashtag-campaigns");
    const res = await listCampaigns(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { campaigns: typeof BASE_CAMPAIGN[] };
    expect(data.campaigns).toHaveLength(1);
    expect(data.campaigns[0].name).toBe("Summer Sale");
    expect(data.campaigns[0].hashtags).toEqual(["summersale", "deals"]);
    expect(data.campaigns[0].isActive).toBe(true);
  });
});

// ── POST /api/hashtag-campaigns ───────────────────────────────────────────────

describe("POST /api/hashtag-campaigns", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/hashtag-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createCampaign(makeRequest({ name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createCampaign(makeRequest({ name: "Test" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createCampaign(makeRequest({ hashtags: ["test"], startDate: "2026-06-01T00:00:00.000Z" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when startDate is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createCampaign(makeRequest({ name: "Test" }));
    expect(res.status).toBe(400);
  });

  it("returns 422 when max campaigns limit is reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(50); // at max
    const res = await createCampaign(
      makeRequest({ name: "New", hashtags: ["tag"], startDate: "2026-06-01T00:00:00.000Z" })
    );
    expect(res.status).toBe(422);
  });

  it("returns 201 and creates campaign successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_CAMPAIGN);
    const res = await createCampaign(
      makeRequest({
        name: "Summer Sale",
        hashtags: ["summersale", "deals"],
        startDate: "2026-06-01T00:00:00.000Z",
        endDate: "2026-08-31T00:00:00.000Z",
        targetPlatforms: ["FACEBOOK", "INSTAGRAM"],
        goal: "Reach 100k impressions",
      })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { name: string };
    expect(data.name).toBe("Summer Sale");
  });
});

// ── PATCH /api/hashtag-campaigns/[id] ────────────────────────────────────────

describe("PATCH /api/hashtag-campaigns/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id: string, body: unknown) {
    return new NextRequest(`http://localhost:3000/api/hashtag-campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateCampaign(
      makeRequest(CAMPAIGN_ID, { name: "Updated" }),
      makeParams(CAMPAIGN_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when campaign belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValueOnce(null); // not found for this user
    const res = await updateCampaign(
      makeRequest(CAMPAIGN_ID, { name: "Updated" }),
      makeParams(CAMPAIGN_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with updated campaign", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValueOnce(BASE_CAMPAIGN);
    mockUpdate.mockResolvedValueOnce({ ...BASE_CAMPAIGN, name: "Updated Name" });
    const res = await updateCampaign(
      makeRequest(CAMPAIGN_ID, { name: "Updated Name" }),
      makeParams(CAMPAIGN_ID)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { name: string };
    expect(data.name).toBe("Updated Name");
  });
});

// ── DELETE /api/hashtag-campaigns/[id] ───────────────────────────────────────

describe("DELETE /api/hashtag-campaigns/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id = CAMPAIGN_ID) {
    return new NextRequest(`http://localhost:3000/api/hashtag-campaigns/${id}`, {
      method: "DELETE",
    });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteCampaign(makeRequest(), makeParams(CAMPAIGN_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when campaign does not belong to user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValueOnce(null);
    const res = await deleteCampaign(makeRequest(), makeParams(CAMPAIGN_ID));
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValueOnce(BASE_CAMPAIGN);
    mockDelete.mockResolvedValueOnce(BASE_CAMPAIGN);
    const res = await deleteCampaign(makeRequest(), makeParams(CAMPAIGN_ID));
    expect(res.status).toBe(204);
  });
});

// ── GET /api/hashtag-campaigns/[id]/performance ───────────────────────────────

describe("GET /api/hashtag-campaigns/[id]/performance", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id = CAMPAIGN_ID) {
    return new NextRequest(
      `http://localhost:3000/api/hashtag-campaigns/${id}/performance`
    );
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getPerformance(makeRequest(), makeParams(CAMPAIGN_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await getPerformance(makeRequest(), makeParams(CAMPAIGN_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 when campaign belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValueOnce(null);
    const res = await getPerformance(makeRequest(), makeParams(CAMPAIGN_ID));
    expect(res.status).toBe(404);
  });

  it("returns performance data with all required fields", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValueOnce(BASE_CAMPAIGN);
    // Mock posts with matching hashtags
    mockPostFindMany.mockResolvedValueOnce([
      {
        id: "post1",
        content: "Check out our #summersale deals!",
        status: "PUBLISHED",
        updatedAt: new Date("2026-06-15T12:00:00.000Z"),
        publishResults: [
          {
            id: "pr1",
            platform: "FACEBOOK",
            status: "PUBLISHED",
            publishedAt: new Date("2026-06-15T12:00:00.000Z"),
            insights: [
              {
                id: "ins1",
                impressions: 1000,
                reach: 800,
                likes: 50,
                comments: 10,
                shares: 5,
                syncedAt: new Date(),
              },
            ],
          },
        ],
      },
    ]);

    const res = await getPerformance(makeRequest(), makeParams(CAMPAIGN_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      campaign: unknown;
      totalPosts: number;
      totalImpressions: number;
      totalReach: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
      avgEngagement: number;
      byHashtag: unknown[];
      byPlatform: unknown[];
      topPosts: unknown[];
      dailyActivity: unknown[];
    };
    expect(data.campaign).toBeDefined();
    expect(typeof data.totalPosts).toBe("number");
    expect(typeof data.totalImpressions).toBe("number");
    expect(typeof data.totalReach).toBe("number");
    expect(typeof data.totalLikes).toBe("number");
    expect(typeof data.totalComments).toBe("number");
    expect(typeof data.totalShares).toBe("number");
    expect(typeof data.avgEngagement).toBe("number");
    expect(Array.isArray(data.byHashtag)).toBe(true);
    expect(Array.isArray(data.byPlatform)).toBe(true);
    expect(Array.isArray(data.topPosts)).toBe(true);
    expect(Array.isArray(data.dailyActivity)).toBe(true);
    // Post with matching hashtag should be counted
    expect(data.totalPosts).toBe(1);
    expect(data.totalImpressions).toBe(1000);
    expect(data.totalLikes).toBe(50);
  });

  it("returns empty performance when campaign has no matching posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const campaignNoHashtags = { ...BASE_CAMPAIGN, hashtags: [] };
    mockFindFirst.mockResolvedValueOnce(campaignNoHashtags);

    const res = await getPerformance(makeRequest(), makeParams(CAMPAIGN_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { totalPosts: number; byHashtag: unknown[] };
    expect(data.totalPosts).toBe(0);
    expect(data.byHashtag).toHaveLength(0);
  });

  it("filters out posts that do not contain campaign hashtags", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValueOnce(BASE_CAMPAIGN); // hashtags: ["summersale", "deals"]
    // Post does NOT contain campaign hashtags
    mockPostFindMany.mockResolvedValueOnce([
      {
        id: "post2",
        content: "Totally unrelated content without any matching hashtag",
        status: "PUBLISHED",
        updatedAt: new Date("2026-06-20T12:00:00.000Z"),
        publishResults: [
          {
            id: "pr2",
            platform: "INSTAGRAM",
            status: "PUBLISHED",
            publishedAt: new Date("2026-06-20T12:00:00.000Z"),
            insights: [],
          },
        ],
      },
    ]);

    const res = await getPerformance(makeRequest(), makeParams(CAMPAIGN_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { totalPosts: number };
    expect(data.totalPosts).toBe(0);
  });
});
