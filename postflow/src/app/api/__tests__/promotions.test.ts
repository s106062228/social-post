jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
    LINKEDIN: "LINKEDIN",
    PINTEREST: "PINTEREST",
    YOUTUBE: "YOUTUBE",
    TIKTOK: "TIKTOK",
    TWITTER: "TWITTER",
    BLUESKY: "BLUESKY",
    MASTODON: "MASTODON",
    TELEGRAM: "TELEGRAM",
    REDDIT: "REDDIT",
    NOSTR: "NOSTR",
    TUMBLR: "TUMBLR",
    WORDPRESS: "WORDPRESS",
    MEDIUM: "MEDIUM",
    GHOST: "GHOST",
    DEVTO: "DEVTO",
    GOOGLE_BUSINESS: "GOOGLE_BUSINESS",
    HASHNODE: "HASHNODE",
    BEEHIIV: "BEEHIIV",
    PIXELFED: "PIXELFED",
    VIMEO: "VIMEO",
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
    postPromotion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listPromotions, POST as createPromotion } from "@/app/api/promotions/route";
import {
  PATCH as updatePromotion,
  DELETE as deletePromotion,
} from "@/app/api/promotions/[id]/route";
import { GET as getPromotionRoi } from "@/app/api/analytics/promotion-roi/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.postPromotion.findMany as jest.Mock;
const mockFindUnique = prisma.postPromotion.findUnique as jest.Mock;
const mockCount = prisma.postPromotion.count as jest.Mock;
const mockCreate = prisma.postPromotion.create as jest.Mock;
const mockUpdate = prisma.postPromotion.update as jest.Mock;
const mockDelete = prisma.postPromotion.delete as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;

const MOCK_USER_ID = "cltest0000000user000001";
const OTHER_USER_ID = "cltest0000000user000002";
const PROMOTION_ID = "cltest0000000promo00001";
const POST_ID = "cltest0000000post000001";

const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_PROMOTION = {
  id: PROMOTION_ID,
  postId: POST_ID,
  platform: "FACEBOOK",
  campaignName: "Summer Launch",
  budget: 1000,
  spend: 250,
  currency: "USD",
  startDate: new Date("2026-06-01T00:00:00.000Z"),
  endDate: new Date("2026-06-30T00:00:00.000Z"),
  goal: "Reach 50k impressions",
  status: "ACTIVE",
  impressions: 10000,
  clicks: 500,
  conversions: 25,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  post: { id: POST_ID, content: "Check out our summer launch!" },
};

// ── GET /api/promotions ───────────────────────────────────────────────────────

describe("GET /api/promotions", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(query = "") {
    return new NextRequest(`http://localhost:3000/api/promotions${query}`);
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listPromotions(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listPromotions(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns empty list when no promotions", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await listPromotions(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: unknown[] };
    expect(data.items).toHaveLength(0);
  });

  it("returns promotions with expected shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_PROMOTION]);
    const res = await listPromotions(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: typeof BASE_PROMOTION[] };
    expect(data.items).toHaveLength(1);
    expect(data.items[0].campaignName).toBe("Summer Launch");
    expect(data.items[0].platform).toBe("FACEBOOK");
    expect(data.items[0].status).toBe("ACTIVE");
  });

  it("filters by status query parameter", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_PROMOTION]);
    const res = await listPromotions(makeRequest("?status=ACTIVE"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: MOCK_USER_ID, status: "ACTIVE" }),
      })
    );
  });

  it("filters by platform query parameter", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_PROMOTION]);
    const res = await listPromotions(makeRequest("?platform=INSTAGRAM"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: MOCK_USER_ID, platform: "INSTAGRAM" }),
      })
    );
  });

  it("ignores invalid status/platform query parameters", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await listPromotions(makeRequest("?status=BOGUS&platform=BOGUS"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID },
      })
    );
  });
});

// ── POST /api/promotions ──────────────────────────────────────────────────────

describe("POST /api/promotions", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const VALID_BODY = {
    platform: "FACEBOOK",
    campaignName: "Summer Launch",
    budget: 1000,
    startDate: "2026-06-01T00:00:00.000Z",
  };

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createPromotion(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createPromotion(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
  });

  it("returns 400 when JSON body is invalid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await createPromotion(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 when campaignName is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createPromotion(
      makeRequest({ platform: "FACEBOOK", budget: 1000, startDate: "2026-06-01T00:00:00.000Z" })
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when platform is invalid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createPromotion(
      makeRequest({ ...VALID_BODY, platform: "NOT_A_PLATFORM" })
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when budget is negative", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createPromotion(makeRequest({ ...VALID_BODY, budget: -10 }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when max promotions limit is reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(200); // at max
    const res = await createPromotion(makeRequest(VALID_BODY));
    expect(res.status).toBe(422);
  });

  it("returns 404 when linked post does not belong to user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockPostFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: OTHER_USER_ID });
    const res = await createPromotion(makeRequest({ ...VALID_BODY, postId: POST_ID }));
    expect(res.status).toBe(404);
  });

  it("returns 201 and creates a promotion successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_PROMOTION);
    const res = await createPromotion(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { item: typeof BASE_PROMOTION };
    expect(data.item.campaignName).toBe("Summer Launch");
    expect(data.item.platform).toBe("FACEBOOK");
  });

  it("returns 201 when linked post belongs to user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockPostFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: MOCK_USER_ID });
    mockCreate.mockResolvedValueOnce(BASE_PROMOTION);
    const res = await createPromotion(makeRequest({ ...VALID_BODY, postId: POST_ID }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { item: typeof BASE_PROMOTION };
    expect(data.item.postId).toBe(POST_ID);
  });
});

// ── PATCH /api/promotions/[id] ────────────────────────────────────────────────

describe("PATCH /api/promotions/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id: string, body: unknown) {
    return new NextRequest(`http://localhost:3000/api/promotions/${id}`, {
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
    const res = await updatePromotion(
      makeRequest(PROMOTION_ID, { campaignName: "Updated" }),
      makeParams(PROMOTION_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await updatePromotion(
      makeRequest(PROMOTION_ID, { campaignName: "Updated" }),
      makeParams(PROMOTION_ID)
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 when JSON body is invalid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest(`http://localhost:3000/api/promotions/${PROMOTION_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await updatePromotion(req, makeParams(PROMOTION_ID));
    expect(res.status).toBe(400);
  });

  it("returns 422 when status is invalid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await updatePromotion(
      makeRequest(PROMOTION_ID, { status: "NOT_A_STATUS" }),
      makeParams(PROMOTION_ID)
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when promotion does not belong to user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PROMOTION, userId: OTHER_USER_ID });
    const res = await updatePromotion(
      makeRequest(PROMOTION_ID, { campaignName: "Updated" }),
      makeParams(PROMOTION_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when promotion does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await updatePromotion(
      makeRequest(PROMOTION_ID, { campaignName: "Updated" }),
      makeParams(PROMOTION_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when reassigned post does not belong to user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PROMOTION, userId: MOCK_USER_ID });
    mockPostFindUnique.mockResolvedValueOnce({ id: "otherpost", userId: OTHER_USER_ID });
    const res = await updatePromotion(
      makeRequest(PROMOTION_ID, { postId: "otherpost" }),
      makeParams(PROMOTION_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with the updated promotion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PROMOTION, userId: MOCK_USER_ID });
    mockUpdate.mockResolvedValueOnce({ ...BASE_PROMOTION, campaignName: "Updated Name", status: "COMPLETED" });
    const res = await updatePromotion(
      makeRequest(PROMOTION_ID, { campaignName: "Updated Name", status: "COMPLETED" }),
      makeParams(PROMOTION_ID)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { item: typeof BASE_PROMOTION };
    expect(data.item.campaignName).toBe("Updated Name");
    expect(data.item.status).toBe("COMPLETED");
  });
});

// ── DELETE /api/promotions/[id] ───────────────────────────────────────────────

describe("DELETE /api/promotions/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id = PROMOTION_ID) {
    return new NextRequest(`http://localhost:3000/api/promotions/${id}`, {
      method: "DELETE",
    });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deletePromotion(makeRequest(), makeParams(PROMOTION_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deletePromotion(makeRequest(), makeParams(PROMOTION_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 when promotion does not belong to user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PROMOTION, userId: OTHER_USER_ID });
    const res = await deletePromotion(makeRequest(), makeParams(PROMOTION_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when promotion does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await deletePromotion(makeRequest(), makeParams(PROMOTION_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 with success on deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PROMOTION, userId: MOCK_USER_ID });
    mockDelete.mockResolvedValueOnce(BASE_PROMOTION);
    const res = await deletePromotion(makeRequest(), makeParams(PROMOTION_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });
});

// ── GET /api/analytics/promotion-roi ──────────────────────────────────────────

describe("GET /api/analytics/promotion-roi", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(query = "") {
    return new NextRequest(`http://localhost:3000/api/analytics/promotion-roi${query}`);
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getPromotionRoi(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await getPromotionRoi(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for an invalid period", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await getPromotionRoi(makeRequest("?period=invalid"));
    expect(res.status).toBe(400);
  });

  it("defaults to the 30d period and returns expected shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await getPromotionRoi(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      period: string;
      platforms: unknown[];
      totalBudget: number;
      totalSpend: number;
      totalPromotions: number;
      activePromotions: number;
    };
    expect(data.period).toBe("30d");
    expect(data.platforms).toEqual([]);
    expect(data.totalBudget).toBe(0);
    expect(data.totalSpend).toBe(0);
    expect(data.totalPromotions).toBe(0);
    expect(data.activePromotions).toBe(0);
  });

  it("computes totals and platform breakdown for promotions", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      {
        platform: "FACEBOOK",
        budget: 1000,
        spend: 400,
        impressions: 20000,
        clicks: 800,
        conversions: 40,
        status: "ACTIVE",
      },
      {
        platform: "INSTAGRAM",
        budget: 500,
        spend: 500,
        impressions: 10000,
        clicks: 300,
        conversions: 10,
        status: "COMPLETED",
      },
    ]);
    const res = await getPromotionRoi(makeRequest("?period=90d"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      period: string;
      platforms: { platform: string; promotionCount: number; totalSpend: number }[];
      totalBudget: number;
      totalSpend: number;
      totalPromotions: number;
      activePromotions: number;
    };
    expect(data.period).toBe("90d");
    expect(data.totalBudget).toBe(1500);
    expect(data.totalSpend).toBe(900);
    expect(data.totalPromotions).toBe(2);
    expect(data.activePromotions).toBe(1);
    expect(data.platforms).toHaveLength(2);
    expect(data.platforms[0].platform).toBe("INSTAGRAM");
    expect(data.platforms[0].promotionCount).toBe(1);
  });

  it("queries without a date filter for the 'all' period", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await getPromotionRoi(makeRequest("?period=all"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID },
      })
    );
  });
});
