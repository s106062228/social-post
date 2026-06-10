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
    competitorAccount: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    competitorSnapshot: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";
import { POST as POST_SNAPSHOT } from "../[id]/snapshot/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.competitorAccount.findMany as jest.Mock;
const mockCount = prisma.competitorAccount.count as jest.Mock;
const mockCreate = prisma.competitorAccount.create as jest.Mock;
const mockFindFirst = prisma.competitorAccount.findFirst as jest.Mock;
const mockUpdate = prisma.competitorAccount.update as jest.Mock;
const mockDelete = prisma.competitorAccount.delete as jest.Mock;
const mockSnapshotCreate = prisma.competitorSnapshot.create as jest.Mock;

const AUTHED = { user: { id: "user-1" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

const sampleCompetitor = {
  id: "comp-1",
  userId: "user-1",
  name: "Competitor A",
  platform: "INSTAGRAM",
  handle: "@compA",
  profileUrl: null,
  notes: null,
  snapshots: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReq(url: string, opts?: { method?: string; body?: string }): NextRequest {
  return new NextRequest(url, {
    method: opts?.method ?? "GET",
    headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
    body: opts?.body,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/competitor-accounts", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq("http://localhost/api/competitor-accounts"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET(makeReq("http://localhost/api/competitor-accounts"));
    expect(res.status).toBe(429);
  });

  it("returns empty list", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/competitor-accounts"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.competitors).toEqual([]);
  });

  it("returns competitors with latest snapshot", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([sampleCompetitor]);
    const res = await GET(makeReq("http://localhost/api/competitor-accounts"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.competitors).toHaveLength(1);
    expect(body.competitors[0].name).toBe("Competitor A");
    expect(body.competitors[0].platform).toBe("INSTAGRAM");
  });
});

describe("POST /api/competitor-accounts", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(
      makeReq("http://localhost/api/competitor-accounts", {
        method: "POST",
        body: JSON.stringify({ name: "A", platform: "INSTAGRAM", handle: "@a" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await POST(
      makeReq("http://localhost/api/competitor-accounts", {
        method: "POST",
        body: JSON.stringify({ name: "A", platform: "INSTAGRAM", handle: "@a" }),
      })
    );
    expect(res.status).toBe(429);
  });

  it("returns 422 when max limit reached", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockCount.mockResolvedValue(20);
    const res = await POST(
      makeReq("http://localhost/api/competitor-accounts", {
        method: "POST",
        body: JSON.stringify({ name: "A", platform: "INSTAGRAM", handle: "@a" }),
      })
    );
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockCount.mockResolvedValue(0);
    const res = await POST(
      makeReq("http://localhost/api/competitor-accounts", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("creates competitor successfully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue(sampleCompetitor);
    const res = await POST(
      makeReq("http://localhost/api/competitor-accounts", {
        method: "POST",
        body: JSON.stringify({
          name: "Competitor A",
          platform: "INSTAGRAM",
          handle: "@compA",
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Competitor A");
    expect(body.platform).toBe("INSTAGRAM");
  });
});

describe("PATCH /api/competitor-accounts/[id]", () => {
  it("returns 404 when not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeReq("http://localhost/api/competitor-accounts/comp-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      { params: Promise.resolve({ id: "comp-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("updates competitor successfully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(sampleCompetitor);
    mockUpdate.mockResolvedValue({ ...sampleCompetitor, name: "Updated" });
    const res = await PATCH(
      makeReq("http://localhost/api/competitor-accounts/comp-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      { params: Promise.resolve({ id: "comp-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated");
  });
});

describe("DELETE /api/competitor-accounts/[id]", () => {
  it("returns 404 when not found or wrong owner", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(null);
    const res = await DELETE(
      makeReq("http://localhost/api/competitor-accounts/comp-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "comp-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("deletes competitor successfully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(sampleCompetitor);
    mockDelete.mockResolvedValue(sampleCompetitor);
    const res = await DELETE(
      makeReq("http://localhost/api/competitor-accounts/comp-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "comp-1" }) }
    );
    expect(res.status).toBe(204);
  });
});

describe("POST /api/competitor-accounts/[id]/snapshot", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST_SNAPSHOT(
      makeReq("http://localhost/api/competitor-accounts/comp-1/snapshot", {
        method: "POST",
        body: JSON.stringify({ followersCount: 1000 }),
      }),
      { params: Promise.resolve({ id: "comp-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await POST_SNAPSHOT(
      makeReq("http://localhost/api/competitor-accounts/comp-1/snapshot", {
        method: "POST",
        body: JSON.stringify({ followersCount: 1000 }),
      }),
      { params: Promise.resolve({ id: "comp-1" }) }
    );
    expect(res.status).toBe(429);
  });

  it("returns 404 when competitor not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(null);
    const res = await POST_SNAPSHOT(
      makeReq("http://localhost/api/competitor-accounts/comp-1/snapshot", {
        method: "POST",
        body: JSON.stringify({ followersCount: 1000 }),
      }),
      { params: Promise.resolve({ id: "comp-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("records snapshot successfully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(sampleCompetitor);
    const snapshot = {
      id: "snap-1",
      competitorId: "comp-1",
      followersCount: 5000,
      avgEngagementRate: 2.5,
      postsPerWeek: 7,
      avgLikes: 150,
      avgComments: 12,
      recordedAt: new Date(),
      createdAt: new Date(),
    };
    mockSnapshotCreate.mockResolvedValue(snapshot);
    const res = await POST_SNAPSHOT(
      makeReq("http://localhost/api/competitor-accounts/comp-1/snapshot", {
        method: "POST",
        body: JSON.stringify({
          followersCount: 5000,
          avgEngagementRate: 2.5,
          postsPerWeek: 7,
          avgLikes: 150,
          avgComments: 12,
        }),
      }),
      { params: Promise.resolve({ id: "comp-1" }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.followersCount).toBe(5000);
    expect(body.avgEngagementRate).toBe(2.5);
    expect(mockSnapshotCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          competitorId: "comp-1",
          followersCount: 5000,
          avgEngagementRate: 2.5,
        }),
      })
    );
  });
});
