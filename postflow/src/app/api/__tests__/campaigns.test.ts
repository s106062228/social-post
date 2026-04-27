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
    campaign: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    campaignPost: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listCampaigns, POST as createCampaign } from "@/app/api/campaigns/route";
import {
  GET as getCampaign,
  PATCH as updateCampaign,
  DELETE as deleteCampaign,
} from "@/app/api/campaigns/[id]/route";
import { POST as addPost } from "@/app/api/campaigns/[id]/posts/route";
import { DELETE as removePost } from "@/app/api/campaigns/[id]/posts/[postId]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockCampaignFindMany = prisma.campaign.findMany as jest.Mock;
const mockCampaignFindUnique = prisma.campaign.findUnique as jest.Mock;
const mockCampaignCreate = prisma.campaign.create as jest.Mock;
const mockCampaignUpdate = prisma.campaign.update as jest.Mock;
const mockCampaignDelete = prisma.campaign.delete as jest.Mock;
const mockCampaignPostFindUnique = prisma.campaignPost.findUnique as jest.Mock;
const mockCampaignPostCreate = prisma.campaignPost.create as jest.Mock;
const mockCampaignPostDelete = prisma.campaignPost.delete as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const VALID_CAMPAIGN_ID = "clh3ck8zp0001qr5hyvxckahk";
const VALID_POST_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_CAMPAIGN = {
  id: VALID_CAMPAIGN_ID,
  userId: MOCK_USER_ID,
  name: "Summer Launch",
  description: "Q3 product launch campaign",
  goal: "Reach 10k impressions",
  startDate: new Date("2026-06-01"),
  endDate: new Date("2026-08-31"),
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { posts: 3 },
};

const BASE_POST = {
  id: VALID_POST_ID,
  userId: MOCK_USER_ID,
  content: "Check out our new product!",
  status: "DRAFT",
};

// ── GET /api/campaigns ────────────────────────────────────────────────────────

describe("GET /api/campaigns", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listCampaigns();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listCampaigns();
    expect(res.status).toBe(429);
  });

  it("returns list of campaigns", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindMany.mockResolvedValueOnce([BASE_CAMPAIGN]);

    const res = await listCampaigns();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { campaigns: typeof BASE_CAMPAIGN[] };
    expect(data.campaigns).toHaveLength(1);
    expect(data.campaigns[0].name).toBe("Summer Launch");
  });

  it("queries only the authenticated user's campaigns", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindMany.mockResolvedValueOnce([]);

    await listCampaigns();
    expect(mockCampaignFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindMany.mockRejectedValueOnce(new Error("DB error"));
    const res = await listCampaigns();
    expect(res.status).toBe(500);
  });
});

// ── POST /api/campaigns ───────────────────────────────────────────────────────

describe("POST /api/campaigns", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/campaigns", {
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
    const res = await createCampaign(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when startDate is after endDate", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createCampaign(
      makeRequest({
        name: "Test",
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-06-01T00:00:00.000Z",
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("startDate");
  });

  it("returns 201 with created campaign", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignCreate.mockResolvedValueOnce(BASE_CAMPAIGN);

    const res = await createCampaign(makeRequest({ name: "Summer Launch" }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { name: string };
    expect(data.name).toBe("Summer Launch");
  });

  it("creates campaign with authenticated user's id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignCreate.mockResolvedValueOnce(BASE_CAMPAIGN);

    await createCampaign(makeRequest({ name: "Test" }));
    expect(mockCampaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: MOCK_USER_ID }),
      })
    );
  });
});

// ── PATCH /api/campaigns/[id] ─────────────────────────────────────────────────

describe("PATCH /api/campaigns/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id: string, body: unknown) {
    return new NextRequest(`http://localhost:3000/api/campaigns/${id}`, {
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
      makeRequest(VALID_CAMPAIGN_ID, { name: "New name" }),
      makeParams(VALID_CAMPAIGN_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when campaign belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce({ ...BASE_CAMPAIGN, userId: OTHER_USER_ID });
    const res = await updateCampaign(
      makeRequest(VALID_CAMPAIGN_ID, { name: "New name" }),
      makeParams(VALID_CAMPAIGN_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with updated campaign", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce(BASE_CAMPAIGN);
    mockCampaignUpdate.mockResolvedValueOnce({ ...BASE_CAMPAIGN, name: "Updated" });

    const res = await updateCampaign(
      makeRequest(VALID_CAMPAIGN_ID, { name: "Updated" }),
      makeParams(VALID_CAMPAIGN_ID)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { name: string };
    expect(data.name).toBe("Updated");
  });
});

// ── DELETE /api/campaigns/[id] ────────────────────────────────────────────────

describe("DELETE /api/campaigns/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id = VALID_CAMPAIGN_ID) {
    return new NextRequest(`http://localhost:3000/api/campaigns/${id}`, { method: "DELETE" });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteCampaign(makeRequest(), makeParams(VALID_CAMPAIGN_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when campaign does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce(null);
    const res = await deleteCampaign(makeRequest(), makeParams(VALID_CAMPAIGN_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when campaign belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce({ ...BASE_CAMPAIGN, userId: OTHER_USER_ID });
    const res = await deleteCampaign(makeRequest(), makeParams(VALID_CAMPAIGN_ID));
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce(BASE_CAMPAIGN);
    mockCampaignDelete.mockResolvedValueOnce(BASE_CAMPAIGN);
    const res = await deleteCampaign(makeRequest(), makeParams(VALID_CAMPAIGN_ID));
    expect(res.status).toBe(204);
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce(BASE_CAMPAIGN);
    mockCampaignDelete.mockRejectedValueOnce(new Error("DB error"));
    const res = await deleteCampaign(makeRequest(), makeParams(VALID_CAMPAIGN_ID));
    expect(res.status).toBe(500);
  });
});

// ── POST /api/campaigns/[id]/posts ────────────────────────────────────────────

describe("POST /api/campaigns/[id]/posts", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(campaignId: string, body: unknown) {
    return new NextRequest(`http://localhost:3000/api/campaigns/${campaignId}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await addPost(
      makeRequest(VALID_CAMPAIGN_ID, { postId: VALID_POST_ID }),
      makeParams(VALID_CAMPAIGN_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when campaign not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce(null);
    const res = await addPost(
      makeRequest(VALID_CAMPAIGN_ID, { postId: VALID_POST_ID }),
      makeParams(VALID_CAMPAIGN_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when post does not belong to user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce(BASE_CAMPAIGN);
    mockPostFindUnique.mockResolvedValueOnce({ ...BASE_POST, userId: OTHER_USER_ID });
    const res = await addPost(
      makeRequest(VALID_CAMPAIGN_ID, { postId: VALID_POST_ID }),
      makeParams(VALID_CAMPAIGN_ID)
    );
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 409 when post is already in campaign", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce(BASE_CAMPAIGN);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    const err = new Error("Unique constraint");
    (err as unknown as Record<string, unknown>).code = "P2002";
    mockCampaignPostCreate.mockRejectedValueOnce(err);
    const res = await addPost(
      makeRequest(VALID_CAMPAIGN_ID, { postId: VALID_POST_ID }),
      makeParams(VALID_CAMPAIGN_ID)
    );
    expect(res.status).toBe(409);
  });

  it("returns 201 on successful add", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce(BASE_CAMPAIGN);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockCampaignPostCreate.mockResolvedValueOnce({
      campaignId: VALID_CAMPAIGN_ID,
      postId: VALID_POST_ID,
      addedAt: new Date(),
    });
    const res = await addPost(
      makeRequest(VALID_CAMPAIGN_ID, { postId: VALID_POST_ID }),
      makeParams(VALID_CAMPAIGN_ID)
    );
    expect(res.status).toBe(201);
  });
});

// ── DELETE /api/campaigns/[id]/posts/[postId] ─────────────────────────────────

describe("DELETE /api/campaigns/[id]/posts/[postId]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(campaignId: string, postId: string) {
    return new NextRequest(
      `http://localhost:3000/api/campaigns/${campaignId}/posts/${postId}`,
      { method: "DELETE" }
    );
  }
  function makeParams(id: string, postId: string) {
    return { params: Promise.resolve({ id, postId }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await removePost(
      makeRequest(VALID_CAMPAIGN_ID, VALID_POST_ID),
      makeParams(VALID_CAMPAIGN_ID, VALID_POST_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when campaign not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce(null);
    const res = await removePost(
      makeRequest(VALID_CAMPAIGN_ID, VALID_POST_ID),
      makeParams(VALID_CAMPAIGN_ID, VALID_POST_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when post is not in campaign", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce(BASE_CAMPAIGN);
    mockCampaignPostFindUnique.mockResolvedValueOnce(null);
    const res = await removePost(
      makeRequest(VALID_CAMPAIGN_ID, VALID_POST_ID),
      makeParams(VALID_CAMPAIGN_ID, VALID_POST_ID)
    );
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not in campaign");
  });

  it("returns 204 on successful removal", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCampaignFindUnique.mockResolvedValueOnce(BASE_CAMPAIGN);
    mockCampaignPostFindUnique.mockResolvedValueOnce({
      campaignId: VALID_CAMPAIGN_ID,
      postId: VALID_POST_ID,
    });
    mockCampaignPostDelete.mockResolvedValueOnce({});
    const res = await removePost(
      makeRequest(VALID_CAMPAIGN_ID, VALID_POST_ID),
      makeParams(VALID_CAMPAIGN_ID, VALID_POST_ID)
    );
    expect(res.status).toBe(204);
  });
});
