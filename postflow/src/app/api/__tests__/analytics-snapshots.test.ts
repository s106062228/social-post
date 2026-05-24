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
  },
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
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
    analyticsSnapshot: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    post: { count: jest.fn() },
    publishResult: { findMany: jest.fn() },
    socialAccount: { count: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { GET as getSnapshots, POST as postSnapshot } from "@/app/api/analytics/snapshots/route";
import { DELETE as deleteSnapshot } from "@/app/api/analytics/snapshots/[id]/route";
import { GET as compareSnapshots } from "@/app/api/analytics/snapshots/compare/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RL_OK = { success: true, remaining: 99, reset: Date.now() + 60000 };
const RL_FAIL = { success: false, remaining: 0, reset: Date.now() + 60000 };

function makeReq(method: string, body?: unknown, url = "http://localhost/api/analytics/snapshots"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Helper mocks ──────────────────────────────────────────────────────────────

function setupCaptureMetricsMocks() {
  (prisma.post.count as jest.Mock).mockResolvedValue(0);
  (prisma.publishResult.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.socialAccount.count as jest.Mock).mockResolvedValue(0);
}

// ── GET /api/analytics/snapshots ─────────────────────────────────────────────

describe("GET /api/analytics/snapshots", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getSnapshots(makeReq("GET"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await getSnapshots(makeReq("GET"));
    expect(res.status).toBe(429);
  });

  it("returns empty snapshots list", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.analyticsSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);
    const res = await getSnapshots(makeReq("GET"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { snapshots: unknown[] };
    expect(json.snapshots).toHaveLength(0);
  });

  it("returns snapshots list with data", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const snap = { id: "s1", name: "Test Snap", data: { posts: { total: 5 } }, createdAt: new Date() };
    (prisma.analyticsSnapshot.findMany as jest.Mock).mockResolvedValueOnce([snap]);
    const res = await getSnapshots(makeReq("GET"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { snapshots: Array<{ id: string }> };
    expect(json.snapshots).toHaveLength(1);
    expect(json.snapshots[0].id).toBe("s1");
  });
});

// ── POST /api/analytics/snapshots ────────────────────────────────────────────

describe("POST /api/analytics/snapshots", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await postSnapshot(makeReq("POST", { name: "Snap" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await postSnapshot(makeReq("POST", { name: "Snap" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for missing name", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await postSnapshot(makeReq("POST", {}));
    expect(res.status).toBe(400);
  });

  it("returns 422 when max snapshots reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.analyticsSnapshot.count as jest.Mock).mockResolvedValueOnce(20);
    const res = await postSnapshot(makeReq("POST", { name: "Snap" }));
    expect(res.status).toBe(422);
  });

  it("creates snapshot and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.analyticsSnapshot.count as jest.Mock).mockResolvedValueOnce(0);
    setupCaptureMetricsMocks();
    const created = { id: "s1", name: "Snap", data: {}, createdAt: new Date() };
    (prisma.analyticsSnapshot.create as jest.Mock).mockResolvedValueOnce(created);
    const res = await postSnapshot(makeReq("POST", { name: "Snap" }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { snapshot: { id: string; name: string } };
    expect(json.snapshot.id).toBe("s1");
    expect(json.snapshot.name).toBe("Snap");
  });

  it("captures current metrics in snapshot data", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.analyticsSnapshot.count as jest.Mock).mockResolvedValueOnce(0);
    (prisma.post.count as jest.Mock).mockResolvedValue(42);
    (prisma.publishResult.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.socialAccount.count as jest.Mock).mockResolvedValue(3);
    const created = { id: "s2", name: "Snap", data: {}, createdAt: new Date() };
    (prisma.analyticsSnapshot.create as jest.Mock).mockResolvedValueOnce(created);
    await postSnapshot(makeReq("POST", { name: "Snap" }));
    const createCall = (prisma.analyticsSnapshot.create as jest.Mock).mock.calls[0] as Array<{ data: { data: { posts: { total: number }; connectedAccounts: number } } }>;
    expect(createCall[0].data.data.posts.total).toBe(42);
    expect(createCall[0].data.data.connectedAccounts).toBe(3);
  });
});

// ── DELETE /api/analytics/snapshots/[id] ─────────────────────────────────────

describe("DELETE /api/analytics/snapshots/[id]", () => {
  const params = Promise.resolve({ id: "s1" });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteSnapshot(makeReq("DELETE"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await deleteSnapshot(makeReq("DELETE"), { params });
    expect(res.status).toBe(429);
  });

  it("returns 404 when snapshot not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.analyticsSnapshot.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await deleteSnapshot(makeReq("DELETE"), { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when snapshot belongs to different user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.analyticsSnapshot.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await deleteSnapshot(makeReq("DELETE"), { params });
    expect(res.status).toBe(404);
  });

  it("deletes snapshot and returns 204", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const snap = { id: "s1", userId: MOCK_USER_ID, name: "Snap", data: {}, createdAt: new Date() };
    (prisma.analyticsSnapshot.findFirst as jest.Mock).mockResolvedValueOnce(snap);
    (prisma.analyticsSnapshot.delete as jest.Mock).mockResolvedValueOnce(snap);
    const res = await deleteSnapshot(makeReq("DELETE"), { params });
    expect(res.status).toBe(204);
    expect(prisma.analyticsSnapshot.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });
});

// ── GET /api/analytics/snapshots/compare ─────────────────────────────────────

describe("GET /api/analytics/snapshots/compare", () => {
  const fromData = {
    posts: { total: 10, published: 8, failed: 1, scheduled: 0, draft: 1 },
    publishResults: { total: 8, published: 8, overallSuccessRate: 100 },
    platformBreakdown: [],
    connectedAccounts: 2,
    takenAt: "2026-01-01T00:00:00.000Z",
  };
  const toData = {
    posts: { total: 20, published: 15, failed: 2, scheduled: 1, draft: 2 },
    publishResults: { total: 18, published: 15, overallSuccessRate: 83 },
    platformBreakdown: [],
    connectedAccounts: 3,
    takenAt: "2026-02-01T00:00:00.000Z",
  };

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await compareSnapshots(
      makeReq("GET", undefined, "http://localhost/api/analytics/snapshots/compare?from=a&to=b")
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await compareSnapshots(
      makeReq("GET", undefined, "http://localhost/api/analytics/snapshots/compare?from=a&to=b")
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 when from/to params missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await compareSnapshots(
      makeReq("GET", undefined, "http://localhost/api/analytics/snapshots/compare")
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when snapshot not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.analyticsSnapshot.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const res = await compareSnapshots(
      makeReq("GET", undefined, "http://localhost/api/analytics/snapshots/compare?from=a&to=b")
    );
    expect(res.status).toBe(404);
  });

  it("returns comparison deltas with correct change values", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const snapFrom = { id: "a", name: "Before", data: fromData, createdAt: new Date() };
    const snapTo = { id: "b", name: "After", data: toData, createdAt: new Date() };
    (prisma.analyticsSnapshot.findFirst as jest.Mock)
      .mockResolvedValueOnce(snapFrom)
      .mockResolvedValueOnce(snapTo);
    const res = await compareSnapshots(
      makeReq("GET", undefined, "http://localhost/api/analytics/snapshots/compare?from=a&to=b")
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      comparison: {
        deltas: {
          totalPosts: { from: number; to: number; change: number; changePct: number };
          publishedPosts: { change: number };
          connectedAccounts: { change: number };
        };
      };
    };
    expect(json.comparison.deltas.totalPosts.from).toBe(10);
    expect(json.comparison.deltas.totalPosts.to).toBe(20);
    expect(json.comparison.deltas.totalPosts.change).toBe(10);
    expect(json.comparison.deltas.totalPosts.changePct).toBe(100);
    expect(json.comparison.deltas.publishedPosts.change).toBe(7);
    expect(json.comparison.deltas.connectedAccounts.change).toBe(1);
  });

  it("sets changePct null when from value is 0", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const zeroFrom = { ...fromData, posts: { ...fromData.posts, total: 0 }, connectedAccounts: 0 };
    const snapFrom = { id: "a", name: "Empty", data: zeroFrom, createdAt: new Date() };
    const snapTo = { id: "b", name: "After", data: toData, createdAt: new Date() };
    (prisma.analyticsSnapshot.findFirst as jest.Mock)
      .mockResolvedValueOnce(snapFrom)
      .mockResolvedValueOnce(snapTo);
    const res = await compareSnapshots(
      makeReq("GET", undefined, "http://localhost/api/analytics/snapshots/compare?from=a&to=b")
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      comparison: { deltas: { totalPosts: { changePct: null } } };
    };
    expect(json.comparison.deltas.totalPosts.changePct).toBeNull();
  });
});
