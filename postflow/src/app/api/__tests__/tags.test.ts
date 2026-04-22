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
    tag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listTags, POST as createTag } from "@/app/api/tags/route";
import { DELETE as deleteTag } from "@/app/api/tags/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockTagFindMany = prisma.tag.findMany as jest.Mock;
const mockTagFindUnique = prisma.tag.findUnique as jest.Mock;
const mockTagCreate = prisma.tag.create as jest.Mock;
const mockTagDelete = prisma.tag.delete as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_TAG_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_TAG = {
  id: VALID_TAG_ID,
  userId: MOCK_USER_ID,
  name: "launch",
  color: "#6366f1",
  createdAt: new Date(),
  _count: { posts: 0 },
};

// ── GET /api/tags ─────────────────────────────────────────────────────────────

describe("GET /api/tags", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listTags();
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listTags();
    expect(res.status).toBe(429);
  });

  it("returns list of tags sorted by name", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagFindMany.mockResolvedValueOnce([BASE_TAG]);

    const res = await listTags();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tags: typeof BASE_TAG[] };
    expect(data.tags).toHaveLength(1);
    expect(data.tags[0].name).toBe("launch");
  });

  it("queries only the authenticated user's tags", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagFindMany.mockResolvedValueOnce([]);

    await listTags();
    expect(mockTagFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID },
      })
    );
  });

  it("returns empty list when user has no tags", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagFindMany.mockResolvedValueOnce([]);

    const res = await listTags();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tags: unknown[] };
    expect(data.tags).toHaveLength(0);
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagFindMany.mockRejectedValueOnce(new Error("DB error"));
    const res = await listTags();
    expect(res.status).toBe(500);
  });
});

// ── POST /api/tags ────────────────────────────────────────────────────────────

describe("POST /api/tags", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createTag(makeRequest({ name: "launch" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createTag(makeRequest({ name: "launch" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/tags", {
      method: "POST",
      body: "not-json",
    });
    const res = await createTag(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createTag(makeRequest({ color: "#6366f1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when color is invalid hex", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createTag(makeRequest({ name: "launch", color: "not-a-color" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 with created tag", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const created = { id: VALID_TAG_ID, name: "launch", color: "#6366f1", createdAt: new Date() };
    mockTagCreate.mockResolvedValueOnce(created);

    const res = await createTag(makeRequest({ name: "launch" }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof created;
    expect(data.name).toBe("launch");
    expect(data.color).toBe("#6366f1");
  });

  it("uses default color when not provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagCreate.mockResolvedValueOnce({ id: VALID_TAG_ID, name: "launch", color: "#6366f1", createdAt: new Date() });

    await createTag(makeRequest({ name: "launch" }));
    expect(mockTagCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ color: "#6366f1" }),
      })
    );
  });

  it("returns 409 on duplicate tag name (P2002)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const err = new Error("Unique constraint failed");
    (err as unknown as Record<string, unknown>).code = "P2002";
    mockTagCreate.mockRejectedValueOnce(err);

    const res = await createTag(makeRequest({ name: "launch" }));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("already exists");
  });

  it("creates tag with authenticated user's id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagCreate.mockResolvedValueOnce({ id: VALID_TAG_ID, name: "launch", color: "#6366f1", createdAt: new Date() });

    await createTag(makeRequest({ name: "launch" }));
    expect(mockTagCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: MOCK_USER_ID }),
      })
    );
  });

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagCreate.mockRejectedValueOnce(new Error("DB error"));
    const res = await createTag(makeRequest({ name: "launch" }));
    expect(res.status).toBe(500);
  });
});

// ── DELETE /api/tags/[id] ─────────────────────────────────────────────────────

describe("DELETE /api/tags/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id = VALID_TAG_ID) {
    return new NextRequest(`http://localhost:3000/api/tags/${id}`, { method: "DELETE" });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteTag(makeRequest(), makeParams(VALID_TAG_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteTag(makeRequest(), makeParams(VALID_TAG_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await deleteTag(makeRequest("bad-id"), makeParams("bad-id"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when tag does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagFindUnique.mockResolvedValueOnce(null);
    const res = await deleteTag(makeRequest(), makeParams(VALID_TAG_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when tag belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagFindUnique.mockResolvedValueOnce({ ...BASE_TAG, userId: OTHER_USER_ID });
    const res = await deleteTag(makeRequest(), makeParams(VALID_TAG_ID));
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagFindUnique.mockResolvedValueOnce(BASE_TAG);
    mockTagDelete.mockResolvedValueOnce(BASE_TAG);
    const res = await deleteTag(makeRequest(), makeParams(VALID_TAG_ID));
    expect(res.status).toBe(204);
  });

  it("calls prisma.tag.delete with the correct id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagFindUnique.mockResolvedValueOnce(BASE_TAG);
    mockTagDelete.mockResolvedValueOnce(BASE_TAG);
    await deleteTag(makeRequest(), makeParams(VALID_TAG_ID));
    expect(mockTagDelete).toHaveBeenCalledWith({ where: { id: VALID_TAG_ID } });
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTagFindUnique.mockResolvedValueOnce(BASE_TAG);
    mockTagDelete.mockRejectedValueOnce(new Error("DB error"));
    const res = await deleteTag(makeRequest(), makeParams(VALID_TAG_ID));
    expect(res.status).toBe(500);
  });
});
