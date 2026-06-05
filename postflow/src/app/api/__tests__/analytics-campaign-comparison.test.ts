jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
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
    campaign: { findMany: jest.fn() },
    hashtagCampaign: { findMany: jest.fn() },
    collaboration: { findMany: jest.fn() },
    post: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/errors", () => ({
  handleRouteError: (err: unknown) => {
    return new (require("next/server").NextResponse)(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/campaign-comparison/route";
import type { CampaignComparisonResponse } from "@/app/api/analytics/campaign-comparison/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockCampaignFindMany = prisma.campaign.findMany as jest.Mock;
const mockHashtagCampaignFindMany = prisma.hashtagCampaign.findMany as jest.Mock;
const mockCollaborationFindMany = prisma.collaboration.findMany as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/campaign-comparison${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
  // Default: no campaigns of any type
  mockCampaignFindMany.mockResolvedValue([]);
  mockHashtagCampaignFindMany.mockResolvedValue([]);
  mockCollaborationFindMany.mockResolvedValue([]);
  mockPostFindMany.mockResolvedValue([]);
});

// ── Auth ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/campaign-comparison — auth", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });
});

// ── Period validation ─────────────────────────────────────────────────────────

describe("GET /api/analytics/campaign-comparison — period validation", () => {
  it("returns 400 for invalid period", async () => {
    const res = await GET(makeRequest({ period: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("accepts valid periods: 30d, 90d, all", async () => {
    for (const p of ["30d", "90d", "all"]) {
      const res = await GET(makeRequest({ period: p }));
      expect(res.status).toBe(200);
    }
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe("GET /api/analytics/campaign-comparison — empty state", () => {
  it("returns correct shape with no campaigns", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as CampaignComparisonResponse;

    expect(body.period).toBe("30d");
    expect(body.campaigns).toEqual([]);
    expect(body.totalCampaigns).toBe(0);
    expect(body.totalPosts).toBe(0);
    expect(body.totalEngagement).toBe(0);
    expect(body.topCampaign).toBeNull();
  });
});

// ── Content campaign ──────────────────────────────────────────────────────────

describe("GET /api/analytics/campaign-comparison — content campaign", () => {
  it("aggregates engagement from linked posts", async () => {
    mockCampaignFindMany.mockResolvedValue([
      {
        id: "c1",
        name: "Spring Sale",
        isActive: true,
        posts: [
          {
            post: {
              id: "p1",
              publishResults: [
                {
                  status: "PUBLISHED",
                  insights: { likes: 50, comments: 10, shares: 5, impressions: 1000, reach: 800 },
                },
              ],
            },
          },
        ],
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as CampaignComparisonResponse;

    expect(body.campaigns).toHaveLength(1);
    const cam = body.campaigns[0];
    expect(cam.type).toBe("content");
    expect(cam.name).toBe("Spring Sale");
    expect(cam.postCount).toBe(1);
    expect(cam.engagement).toBe(65); // 50 + 10 + 5
    expect(cam.impressions).toBe(1000);
    expect(cam.reach).toBe(800);
    expect(cam.isActive).toBe(true);
  });
});

// ── Hashtag campaign ──────────────────────────────────────────────────────────

describe("GET /api/analytics/campaign-comparison — hashtag campaign", () => {
  it("attributes matching posts to hashtag campaign", async () => {
    mockHashtagCampaignFindMany.mockResolvedValue([
      {
        id: "hc1",
        name: "#SpringVibes",
        hashtags: ["#springvibes"],
        isActive: true,
      },
    ]);
    mockPostFindMany.mockResolvedValue([
      {
        id: "p1",
        publishResults: [
          {
            status: "PUBLISHED",
            insights: { likes: 30, comments: 5, shares: 2, impressions: 500, reach: 400 },
          },
        ],
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as CampaignComparisonResponse;

    const hcItem = body.campaigns.find((c) => c.type === "hashtag");
    expect(hcItem).toBeDefined();
    expect(hcItem!.postCount).toBe(1);
    expect(hcItem!.engagement).toBe(37); // 30 + 5 + 2
  });

  it("returns zero counts for hashtag campaign with no hashtags", async () => {
    mockHashtagCampaignFindMany.mockResolvedValue([
      { id: "hc2", name: "Empty", hashtags: [], isActive: false },
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as CampaignComparisonResponse;

    const hcItem = body.campaigns.find((c) => c.type === "hashtag");
    expect(hcItem!.postCount).toBe(0);
    expect(hcItem!.engagement).toBe(0);
  });
});

// ── Collaboration ─────────────────────────────────────────────────────────────

describe("GET /api/analytics/campaign-comparison — collaboration", () => {
  it("computes costPerEngagement when budget set", async () => {
    mockCollaborationFindMany.mockResolvedValue([
      {
        id: "col1",
        name: "Influencer Deal",
        partnerName: "Jane Doe",
        status: "ACTIVE",
        budget: 1000,
        posts: [
          {
            post: {
              id: "pp1",
              publishResults: [
                {
                  status: "PUBLISHED",
                  insights: { likes: 200, comments: 50, shares: 50, impressions: 5000, reach: 4000 },
                },
              ],
            },
          },
        ],
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as CampaignComparisonResponse;

    const col = body.campaigns.find((c) => c.type === "collaboration");
    expect(col).toBeDefined();
    expect(col!.engagement).toBe(300); // 200 + 50 + 50
    expect(col!.budget).toBe(1000);
    expect(col!.costPerEngagement).toBeCloseTo(1000 / 300, 2);
    expect(col!.isActive).toBe(true);
  });

  it("omits costPerEngagement when no budget", async () => {
    mockCollaborationFindMany.mockResolvedValue([
      {
        id: "col2",
        name: "Free Collab",
        partnerName: "John",
        status: "COMPLETED",
        budget: null,
        posts: [
          {
            post: {
              id: "pp2",
              publishResults: [
                {
                  status: "PUBLISHED",
                  insights: { likes: 10, comments: 2, shares: 1, impressions: 200, reach: 150 },
                },
              ],
            },
          },
        ],
      },
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as CampaignComparisonResponse;

    const col = body.campaigns.find((c) => c.type === "collaboration");
    expect(col!.costPerEngagement).toBeUndefined();
    expect(col!.isActive).toBe(false); // status = COMPLETED
  });
});

// ── topCampaign & sorting ─────────────────────────────────────────────────────

describe("GET /api/analytics/campaign-comparison — topCampaign", () => {
  it("topCampaign is the one with highest engagement", async () => {
    mockCampaignFindMany.mockResolvedValue([
      {
        id: "c_low",
        name: "Low Engager",
        isActive: true,
        posts: [
          {
            post: {
              id: "pl",
              publishResults: [
                {
                  status: "PUBLISHED",
                  insights: { likes: 5, comments: 1, shares: 0, impressions: 100, reach: 80 },
                },
              ],
            },
          },
        ],
      },
    ]);
    mockCollaborationFindMany.mockResolvedValue([
      {
        id: "c_high",
        name: "Big Collab",
        partnerName: "Star",
        status: "ACTIVE",
        budget: null,
        posts: [
          {
            post: {
              id: "ph",
              publishResults: [
                {
                  status: "PUBLISHED",
                  insights: { likes: 500, comments: 100, shares: 50, impressions: 10000, reach: 8000 },
                },
              ],
            },
          },
        ],
      },
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as CampaignComparisonResponse;

    expect(body.topCampaign).not.toBeNull();
    expect(body.topCampaign!.engagement).toBe(650); // 500+100+50
    expect(body.campaigns[0].engagement).toBeGreaterThan(body.campaigns[1].engagement);
  });

  it("returns correct aggregate totals", async () => {
    mockCampaignFindMany.mockResolvedValue([
      {
        id: "c1",
        name: "Camp A",
        isActive: true,
        posts: [
          {
            post: {
              id: "pa",
              publishResults: [
                {
                  status: "PUBLISHED",
                  insights: { likes: 10, comments: 2, shares: 1, impressions: 100, reach: 80 },
                },
              ],
            },
          },
        ],
      },
    ]);
    mockHashtagCampaignFindMany.mockResolvedValue([
      {
        id: "hc1",
        name: "#Tag",
        hashtags: ["#tag"],
        isActive: true,
      },
    ]);
    mockPostFindMany.mockResolvedValue([
      {
        id: "ph",
        publishResults: [
          {
            status: "PUBLISHED",
            insights: { likes: 20, comments: 4, shares: 2, impressions: 200, reach: 160 },
          },
        ],
      },
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as CampaignComparisonResponse;

    expect(body.totalCampaigns).toBe(2);
    expect(body.totalPosts).toBe(2);
    expect(body.totalEngagement).toBe(13 + 26); // 13 from content + 26 from hashtag
  });
});
