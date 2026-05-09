jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    contentPillar: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    post: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/content-score", () => ({
  computeScore: jest.fn().mockReturnValue(0),
}));

import { NextRequest } from "next/server";
import { GET as listPillars, POST as createPillar } from "@/app/api/content-pillars/route";
import { PATCH as updatePillar, DELETE as deletePillar } from "@/app/api/content-pillars/[id]/route";
import { GET as analyticsGet } from "@/app/api/content-pillars/analytics/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.contentPillar.findMany as jest.Mock;
const mockFindUnique = prisma.contentPillar.findUnique as jest.Mock;
const mockCreate = prisma.contentPillar.create as jest.Mock;
const mockUpdate = prisma.contentPillar.update as jest.Mock;
const mockCount = prisma.contentPillar.count as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_PILLAR_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_PILLAR = {
  id: VALID_PILLAR_ID,
  userId: MOCK_USER_ID,
  name: "Educational",
  color: "#6366f1",
  description: "Teach the audience",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { posts: 3 },
};

// ── GET /api/content-pillars ──────────────────────────────────────────────────

describe("GET /api/content-pillars", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listPillars();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listPillars();
    expect(res.status).toBe(429);
  });

  it("returns list of pillars for the authenticated user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_PILLAR]);

    const res = await listPillars();
    expect(res.status).toBe(200);
    const data = await res.json() as { pillars: typeof BASE_PILLAR[] };
    expect(data.pillars).toHaveLength(1);
    expect(data.pillars[0].name).toBe("Educational");
  });

  it("queries only active pillars for the authenticated user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    await listPillars();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID, isActive: true },
      })
    );
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB error"));
    const res = await listPillars();
    expect(res.status).toBe(500);
  });
});

// ── POST /api/content-pillars ─────────────────────────────────────────────────

describe("POST /api/content-pillars", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/content-pillars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createPillar(makeRequest({ name: "Educational" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createPillar(makeRequest({ name: "Educational" }));
    expect(res.status).toBe(429);
  });

  it("returns 422 when max pillars limit reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(20);
    const res = await createPillar(makeRequest({ name: "Educational" }));
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    const req = new NextRequest("http://localhost:3000/api/content-pillars", {
      method: "POST",
      body: "not-json",
    });
    const res = await createPillar(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    const res = await createPillar(makeRequest({ color: "#6366f1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when color is invalid hex", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    const res = await createPillar(makeRequest({ name: "Educational", color: "not-a-color" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 with created pillar", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    const created = { ...BASE_PILLAR, _count: undefined };
    mockCreate.mockResolvedValueOnce(created);

    const res = await createPillar(makeRequest({ name: "Educational" }));
    expect(res.status).toBe(201);
    const data = await res.json() as typeof created;
    expect(data.name).toBe("Educational");
  });

  it("stores pillar with the authenticated user's ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_PILLAR);

    await createPillar(makeRequest({ name: "Educational", color: "#ec4899", description: "My pillar" }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: MOCK_USER_ID, name: "Educational" }),
      })
    );
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockRejectedValueOnce(new Error("DB error"));
    const res = await createPillar(makeRequest({ name: "Educational" }));
    expect(res.status).toBe(500);
  });
});

// ── PATCH /api/content-pillars/[id] ──────────────────────────────────────────

describe("PATCH /api/content-pillars/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id: string, body: unknown) {
    return new NextRequest(`http://localhost:3000/api/content-pillars/${id}`, {
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
    const res = await updatePillar(makeRequest(VALID_PILLAR_ID, { name: "Updated" }), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await updatePillar(makeRequest(VALID_PILLAR_ID, { name: "Updated" }), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await updatePillar(makeRequest("bad-id", { name: "Updated" }), makeParams("bad-id"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when pillar does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await updatePillar(makeRequest(VALID_PILLAR_ID, { name: "Updated" }), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when pillar belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PILLAR, userId: OTHER_USER_ID });
    const res = await updatePillar(makeRequest(VALID_PILLAR_ID, { name: "Updated" }), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid color", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_PILLAR);
    const res = await updatePillar(makeRequest(VALID_PILLAR_ID, { color: "not-hex" }), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(400);
  });

  it("returns 200 with updated pillar", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_PILLAR);
    const updated = { ...BASE_PILLAR, name: "Updated Name" };
    mockUpdate.mockResolvedValueOnce(updated);

    const res = await updatePillar(makeRequest(VALID_PILLAR_ID, { name: "Updated Name" }), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof updated;
    expect(data.name).toBe("Updated Name");
  });
});

// ── DELETE /api/content-pillars/[id] ─────────────────────────────────────────

describe("DELETE /api/content-pillars/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id: string) {
    return new NextRequest(`http://localhost:3000/api/content-pillars/${id}`, { method: "DELETE" });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deletePillar(makeRequest(VALID_PILLAR_ID), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deletePillar(makeRequest(VALID_PILLAR_ID), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await deletePillar(makeRequest("bad-id"), makeParams("bad-id"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when pillar does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await deletePillar(makeRequest(VALID_PILLAR_ID), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when pillar belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PILLAR, userId: OTHER_USER_ID });
    const res = await deletePillar(makeRequest(VALID_PILLAR_ID), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful soft-delete and unlinks posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_PILLAR);
    mockTransaction.mockResolvedValueOnce([]);

    const res = await deletePillar(makeRequest(VALID_PILLAR_ID), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(204);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_PILLAR);
    mockTransaction.mockRejectedValueOnce(new Error("DB error"));
    const res = await deletePillar(makeRequest(VALID_PILLAR_ID), makeParams(VALID_PILLAR_ID));
    expect(res.status).toBe(500);
  });
});

// ── GET /api/content-pillars/analytics ───────────────────────────────────────

describe("GET /api/content-pillars/analytics", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await analyticsGet();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await analyticsGet();
    expect(res.status).toBe(429);
  });

  it("returns analytics for user's pillars", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      {
        id: VALID_PILLAR_ID,
        name: "Educational",
        color: "#6366f1",
        posts: [
          {
            status: "PUBLISHED",
            publishResults: [
              {
                insights: {
                  impressions: 100,
                  reach: 80,
                  likes: 10,
                  comments: 5,
                  shares: 2,
                },
              },
            ],
          },
          {
            status: "SCHEDULED",
            publishResults: [],
          },
          {
            status: "DRAFT",
            publishResults: [],
          },
        ],
      },
    ]);

    const res = await analyticsGet();
    expect(res.status).toBe(200);
    const data = await res.json() as {
      analytics: {
        id: string;
        name: string;
        postCount: number;
        publishedCount: number;
        scheduledCount: number;
        avgEngagementScore: number;
      }[];
    };
    expect(data.analytics).toHaveLength(1);
    const a = data.analytics[0];
    expect(a.name).toBe("Educational");
    expect(a.postCount).toBe(3);
    expect(a.publishedCount).toBe(1);
    expect(a.scheduledCount).toBe(1);
    expect(typeof a.avgEngagementScore).toBe("number");
  });

  it("returns empty analytics when user has no pillars", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await analyticsGet();
    expect(res.status).toBe(200);
    const data = await res.json() as { analytics: unknown[] };
    expect(data.analytics).toHaveLength(0);
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB error"));
    const res = await analyticsGet();
    expect(res.status).toBe(500);
  });
});
