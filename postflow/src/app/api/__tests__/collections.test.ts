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
    postCollection: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    collectionPost: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listCollections, POST as createCollection } from "@/app/api/collections/route";
import {
  PATCH as updateCollection,
  DELETE as deleteCollection,
} from "@/app/api/collections/[id]/route";
import { POST as addPost } from "@/app/api/collections/[id]/posts/route";
import { DELETE as removePost } from "@/app/api/collections/[id]/posts/[postId]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.postCollection.findMany as jest.Mock;
const mockFindUnique = prisma.postCollection.findUnique as jest.Mock;
const mockCreate = prisma.postCollection.create as jest.Mock;
const mockUpdate = prisma.postCollection.update as jest.Mock;
const mockDelete = prisma.postCollection.delete as jest.Mock;
const mockCount = prisma.postCollection.count as jest.Mock;
const mockUpsert = prisma.collectionPost.upsert as jest.Mock;
const mockDeleteMany = prisma.collectionPost.deleteMany as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;

const USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const COL_ID = "clh3ck8zp0001qr5hyvxckahk";
const POST_ID = "clh3ck8zp0002qr5hyvxckahk";
const SESSION = { user: { id: USER_ID, email: "user@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeReq(body?: unknown, url = "http://localhost/api/collections") {
  return new NextRequest(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockApiLimiter.mockResolvedValue(RL_OK);
});

// ── GET /api/collections ──────────────────────────────────────────────────────

describe("GET /api/collections", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listCollections();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await listCollections();
    expect(res.status).toBe(429);
  });

  it("returns collections list", async () => {
    const cols = [
      { id: COL_ID, name: "My Col", description: null, color: "#6366f1", createdAt: new Date(), updatedAt: new Date(), _count: { posts: 3 } },
    ];
    mockFindMany.mockResolvedValue(cols);
    const res = await listCollections();
    expect(res.status).toBe(200);
    const data = await res.json() as { collections: typeof cols };
    expect(data.collections).toHaveLength(1);
    expect(data.collections[0].id).toBe(COL_ID);
    expect(data.collections[0]._count.posts).toBe(3);
  });
});

// ── POST /api/collections ─────────────────────────────────────────────────────

describe("POST /api/collections", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await createCollection(makeReq({ name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await createCollection(makeReq({ name: "Test" }));
    expect(res.status).toBe(429);
  });

  it("returns 422 when max collections reached", async () => {
    mockCount.mockResolvedValue(50);
    const res = await createCollection(makeReq({ name: "Test" }));
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid body", async () => {
    mockCount.mockResolvedValue(0);
    const res = await createCollection(makeReq({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("creates collection successfully", async () => {
    mockCount.mockResolvedValue(0);
    const col = { id: COL_ID, name: "New Col", description: null, color: "#6366f1", createdAt: new Date(), updatedAt: new Date(), _count: { posts: 0 } };
    mockCreate.mockResolvedValue(col);
    const res = await createCollection(makeReq({ name: "New Col" }));
    expect(res.status).toBe(201);
    const data = await res.json() as { collection: typeof col };
    expect(data.collection.name).toBe("New Col");
  });
});

// ── PATCH /api/collections/[id] ───────────────────────────────────────────────

describe("PATCH /api/collections/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await updateCollection(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when collection not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await updateCollection(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when not owner", async () => {
    mockFindUnique.mockResolvedValue({ userId: OTHER_USER_ID });
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await updateCollection(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(403);
  });

  it("updates collection name", async () => {
    mockFindUnique.mockResolvedValue({ userId: USER_ID });
    const updated = { id: COL_ID, name: "Updated", description: null, color: "#6366f1", createdAt: new Date(), updatedAt: new Date(), _count: { posts: 0 } };
    mockUpdate.mockResolvedValue(updated);
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await updateCollection(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { collection: typeof updated };
    expect(data.collection.name).toBe("Updated");
  });
});

// ── DELETE /api/collections/[id] ─────────────────────────────────────────────

describe("DELETE /api/collections/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, { method: "DELETE" });
    const res = await deleteCollection(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when collection not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, { method: "DELETE" });
    const res = await deleteCollection(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when not owner", async () => {
    mockFindUnique.mockResolvedValue({ userId: OTHER_USER_ID });
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, { method: "DELETE" });
    const res = await deleteCollection(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(403);
  });

  it("deletes collection and returns 204", async () => {
    mockFindUnique.mockResolvedValue({ userId: USER_ID });
    mockDelete.mockResolvedValue({});
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, { method: "DELETE" });
    const res = await deleteCollection(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: COL_ID } });
  });
});

// ── POST /api/collections/[id]/posts ─────────────────────────────────────────

describe("POST /api/collections/[id]/posts", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: POST_ID }),
    });
    const res = await addPost(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when collection not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: POST_ID }),
    });
    const res = await addPost(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post not found or not owned", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: USER_ID }); // collection
    mockPostFindUnique.mockResolvedValue(null); // post not found
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: POST_ID }),
    });
    const res = await addPost(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(404);
  });

  it("adds post to collection", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: USER_ID }); // collection
    mockPostFindUnique.mockResolvedValue({ userId: USER_ID }); // post
    mockUpsert.mockResolvedValue({});
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: POST_ID }),
    });
    const res = await addPost(req, { params: Promise.resolve({ id: COL_ID }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { added: boolean };
    expect(data.added).toBe(true);
  });
});

// ── DELETE /api/collections/[id]/posts/[postId] ───────────────────────────────

describe("DELETE /api/collections/[id]/posts/[postId]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}/posts/${POST_ID}`, { method: "DELETE" });
    const res = await removePost(req, { params: Promise.resolve({ id: COL_ID, postId: POST_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when collection not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}/posts/${POST_ID}`, { method: "DELETE" });
    const res = await removePost(req, { params: Promise.resolve({ id: COL_ID, postId: POST_ID }) });
    expect(res.status).toBe(404);
  });

  it("removes post from collection and returns 204", async () => {
    mockFindUnique.mockResolvedValue({ userId: USER_ID });
    mockDeleteMany.mockResolvedValue({ count: 1 });
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}/posts/${POST_ID}`, { method: "DELETE" });
    const res = await removePost(req, { params: Promise.resolve({ id: COL_ID, postId: POST_ID }) });
    expect(res.status).toBe(204);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { collectionId: COL_ID, postId: POST_ID },
    });
  });
});
