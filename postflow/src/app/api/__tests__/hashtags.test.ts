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
    hashtagGroup: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listGroups, POST as createGroup } from "@/app/api/hashtags/route";
import { DELETE as deleteGroup } from "@/app/api/hashtags/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGroupFindMany = prisma.hashtagGroup.findMany as jest.Mock;
const mockGroupFindUnique = prisma.hashtagGroup.findUnique as jest.Mock;
const mockGroupCreate = prisma.hashtagGroup.create as jest.Mock;
const mockGroupDelete = prisma.hashtagGroup.delete as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_GROUP_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_GROUP = {
  id: VALID_GROUP_ID,
  userId: MOCK_USER_ID,
  name: "Marketing",
  hashtags: ["#marketing", "#brand", "#launch"],
  createdAt: new Date(),
};

// ── GET /api/hashtags ─────────────────────────────────────────────────────────

describe("GET /api/hashtags", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listGroups();
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listGroups();
    expect(res.status).toBe(429);
  });

  it("returns list of hashtag groups", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindMany.mockResolvedValueOnce([BASE_GROUP]);

    const res = await listGroups();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { groups: typeof BASE_GROUP[] };
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].name).toBe("Marketing");
    expect(data.groups[0].hashtags).toHaveLength(3);
  });

  it("queries only the authenticated user's groups", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindMany.mockResolvedValueOnce([]);

    await listGroups();
    expect(mockGroupFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });

  it("returns empty list when user has no groups", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindMany.mockResolvedValueOnce([]);

    const res = await listGroups();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { groups: unknown[] };
    expect(data.groups).toHaveLength(0);
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindMany.mockRejectedValueOnce(new Error("DB error"));
    const res = await listGroups();
    expect(res.status).toBe(500);
  });
});

// ── POST /api/hashtags ────────────────────────────────────────────────────────

describe("POST /api/hashtags", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/hashtags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createGroup(makeRequest({ name: "Marketing", hashtags: ["#marketing"] }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createGroup(makeRequest({ name: "Marketing", hashtags: ["#marketing"] }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/hashtags", {
      method: "POST",
      body: "not-json",
    });
    const res = await createGroup(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createGroup(makeRequest({ hashtags: ["#marketing"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when hashtags array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createGroup(makeRequest({ name: "Marketing", hashtags: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when hashtags array is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createGroup(makeRequest({ name: "Marketing" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 with created group", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const created = {
      id: VALID_GROUP_ID,
      name: "Marketing",
      hashtags: ["#marketing", "#brand"],
      createdAt: new Date(),
    };
    mockGroupCreate.mockResolvedValueOnce(created);

    const res = await createGroup(
      makeRequest({ name: "Marketing", hashtags: ["#marketing", "#brand"] })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof created;
    expect(data.name).toBe("Marketing");
    expect(data.hashtags).toHaveLength(2);
  });

  it("normalises hashtags without leading # by prepending it", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupCreate.mockResolvedValueOnce({
      id: VALID_GROUP_ID,
      name: "Marketing",
      hashtags: ["#marketing"],
      createdAt: new Date(),
    });

    await createGroup(makeRequest({ name: "Marketing", hashtags: ["marketing"] }));
    expect(mockGroupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hashtags: ["#marketing"] }),
      })
    );
  });

  it("preserves hashtags that already start with #", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupCreate.mockResolvedValueOnce({
      id: VALID_GROUP_ID,
      name: "Marketing",
      hashtags: ["#marketing"],
      createdAt: new Date(),
    });

    await createGroup(makeRequest({ name: "Marketing", hashtags: ["#marketing"] }));
    expect(mockGroupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hashtags: ["#marketing"] }),
      })
    );
  });

  it("creates group with authenticated user's id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupCreate.mockResolvedValueOnce({
      id: VALID_GROUP_ID,
      name: "Marketing",
      hashtags: ["#marketing"],
      createdAt: new Date(),
    });

    await createGroup(makeRequest({ name: "Marketing", hashtags: ["#marketing"] }));
    expect(mockGroupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: MOCK_USER_ID }),
      })
    );
  });

  it("returns 409 on duplicate group name (P2002)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const err = new Error("Unique constraint failed");
    (err as unknown as Record<string, unknown>).code = "P2002";
    mockGroupCreate.mockRejectedValueOnce(err);

    const res = await createGroup(
      makeRequest({ name: "Marketing", hashtags: ["#marketing"] })
    );
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("already exists");
  });

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupCreate.mockRejectedValueOnce(new Error("DB error"));
    const res = await createGroup(
      makeRequest({ name: "Marketing", hashtags: ["#marketing"] })
    );
    expect(res.status).toBe(500);
  });
});

// ── DELETE /api/hashtags/[id] ─────────────────────────────────────────────────

describe("DELETE /api/hashtags/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id = VALID_GROUP_ID) {
    return new NextRequest(`http://localhost:3000/api/hashtags/${id}`, { method: "DELETE" });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteGroup(makeRequest(), makeParams(VALID_GROUP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteGroup(makeRequest(), makeParams(VALID_GROUP_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid id (too short)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await deleteGroup(makeRequest("bad"), makeParams("bad"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when group does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindUnique.mockResolvedValueOnce(null);
    const res = await deleteGroup(makeRequest(), makeParams(VALID_GROUP_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when group belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindUnique.mockResolvedValueOnce({ ...BASE_GROUP, userId: OTHER_USER_ID });
    const res = await deleteGroup(makeRequest(), makeParams(VALID_GROUP_ID));
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindUnique.mockResolvedValueOnce(BASE_GROUP);
    mockGroupDelete.mockResolvedValueOnce(BASE_GROUP);
    const res = await deleteGroup(makeRequest(), makeParams(VALID_GROUP_ID));
    expect(res.status).toBe(204);
  });

  it("calls prisma.hashtagGroup.delete with the correct id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindUnique.mockResolvedValueOnce(BASE_GROUP);
    mockGroupDelete.mockResolvedValueOnce(BASE_GROUP);
    await deleteGroup(makeRequest(), makeParams(VALID_GROUP_ID));
    expect(mockGroupDelete).toHaveBeenCalledWith({ where: { id: VALID_GROUP_ID } });
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindUnique.mockResolvedValueOnce(BASE_GROUP);
    mockGroupDelete.mockRejectedValueOnce(new Error("DB error"));
    const res = await deleteGroup(makeRequest(), makeParams(VALID_GROUP_ID));
    expect(res.status).toBe(500);
  });
});
