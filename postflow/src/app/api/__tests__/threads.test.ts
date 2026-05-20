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
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findUnique: jest.fn() },
    threadPost: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { GET, POST, PUT } from "@/app/api/posts/[id]/threads/route";
import {
  PATCH,
  DELETE,
} from "@/app/api/posts/[id]/threads/[threadId]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockThreadFindMany = prisma.threadPost.findMany as jest.Mock;
const mockThreadCreate = prisma.threadPost.create as jest.Mock;
const mockThreadUpdate = prisma.threadPost.update as jest.Mock;
const mockThreadDelete = prisma.threadPost.delete as jest.Mock;
const mockThreadFindUnique = prisma.threadPost.findUnique as jest.Mock;
const mockThreadDeleteMany = prisma.threadPost.deleteMany as jest.Mock;
const mockThreadAggregate = prisma.threadPost.aggregate as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const MOCK_THREAD_ID = "clh3ck8zp0002qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0003qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID } };

function makeGetRequest(postId: string) {
  return new NextRequest(`http://localhost/api/posts/${postId}/threads`, { method: "GET" });
}

function makePostRequest(postId: string, body: unknown) {
  return new NextRequest(`http://localhost/api/posts/${postId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePutRequest(postId: string, body: unknown) {
  return new NextRequest(`http://localhost/api/posts/${postId}/threads`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(postId: string, threadId: string, body: unknown) {
  return new NextRequest(`http://localhost/api/posts/${postId}/threads/${threadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(postId: string, threadId: string) {
  return new NextRequest(`http://localhost/api/posts/${postId}/threads/${threadId}`, {
    method: "DELETE",
  });
}

const SAMPLE_THREAD = {
  id: MOCK_THREAD_ID,
  postId: MOCK_POST_ID,
  order: 0,
  content: "Thread item 1",
  mediaUrls: [],
  mediaType: "NONE",
  createdAt: new Date("2026-06-01T10:00:00Z"),
  updatedAt: new Date("2026-06-01T10:00:00Z"),
};

describe("Thread Posts API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
    mockAuth.mockResolvedValue(AUTHED_SESSION);
  });

  // ── GET /api/posts/[id]/threads ───────────────────────────────────────────

  describe("GET /api/posts/[id]/threads", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValueOnce(null);
      const res = await GET(makeGetRequest(MOCK_POST_ID), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 429 when rate limited", async () => {
      mockApiLimiter.mockResolvedValueOnce({ success: false });
      const res = await GET(makeGetRequest(MOCK_POST_ID), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      expect(res.status).toBe(429);
    });

    it("returns 404 when post not found", async () => {
      mockPostFindUnique.mockResolvedValueOnce(null);
      const res = await GET(makeGetRequest(MOCK_POST_ID), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 when post belongs to another user", async () => {
      mockPostFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
      const res = await GET(makeGetRequest(MOCK_POST_ID), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      expect(res.status).toBe(404);
    });

    it("returns thread items ordered by order", async () => {
      mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
      mockThreadFindMany.mockResolvedValueOnce([SAMPLE_THREAD]);

      const res = await GET(makeGetRequest(MOCK_POST_ID), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      const body = await res.json() as { threads: typeof SAMPLE_THREAD[] };
      expect(res.status).toBe(200);
      expect(body.threads).toHaveLength(1);
      expect(body.threads[0].content).toBe("Thread item 1");
    });

    it("returns empty array when no thread items", async () => {
      mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
      mockThreadFindMany.mockResolvedValueOnce([]);

      const res = await GET(makeGetRequest(MOCK_POST_ID), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      const body = await res.json() as { threads: unknown[] };
      expect(res.status).toBe(200);
      expect(body.threads).toHaveLength(0);
    });
  });

  // ── POST /api/posts/[id]/threads ──────────────────────────────────────────

  describe("POST /api/posts/[id]/threads", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValueOnce(null);
      const res = await POST(makePostRequest(MOCK_POST_ID, { content: "hello" }), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 on missing content", async () => {
      mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
      const res = await POST(makePostRequest(MOCK_POST_ID, { mediaUrls: [] }), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      expect(res.status).toBe(400);
    });

    it("creates a thread item and returns 201", async () => {
      mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
      mockThreadAggregate.mockResolvedValueOnce({ _max: { order: null } });
      mockThreadCreate.mockResolvedValueOnce(SAMPLE_THREAD);

      const res = await POST(makePostRequest(MOCK_POST_ID, { content: "Thread item 1" }), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      const body = await res.json() as { thread: typeof SAMPLE_THREAD };
      expect(res.status).toBe(201);
      expect(body.thread.content).toBe("Thread item 1");
    });

    it("assigns next order when not specified", async () => {
      mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
      mockThreadAggregate.mockResolvedValueOnce({ _max: { order: 2 } });
      mockThreadCreate.mockResolvedValueOnce({ ...SAMPLE_THREAD, order: 3 });

      const res = await POST(makePostRequest(MOCK_POST_ID, { content: "new tweet" }), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      expect(res.status).toBe(201);
      expect(mockThreadCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ order: 3 }) })
      );
    });

    it("uses provided order value when specified", async () => {
      mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
      mockThreadCreate.mockResolvedValueOnce({ ...SAMPLE_THREAD, order: 5 });

      const res = await POST(
        makePostRequest(MOCK_POST_ID, { content: "tweet", order: 5 }),
        { params: Promise.resolve({ id: MOCK_POST_ID }) }
      );
      expect(res.status).toBe(201);
      // No aggregate call should be made when order is provided
      expect(mockThreadAggregate).not.toHaveBeenCalled();
    });
  });

  // ── PUT /api/posts/[id]/threads (bulk replace) ────────────────────────────

  describe("PUT /api/posts/[id]/threads", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValueOnce(null);
      const res = await PUT(makePutRequest(MOCK_POST_ID, { threads: [] }), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      expect(res.status).toBe(401);
    });

    it("replaces all threads via transaction", async () => {
      mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
      mockTransaction.mockImplementationOnce(async (fn: (tx: typeof prisma) => Promise<typeof SAMPLE_THREAD[]>) => {
        return fn({
          ...prisma,
          threadPost: {
            ...prisma.threadPost,
            deleteMany: mockThreadDeleteMany.mockResolvedValueOnce({}),
            create: mockThreadCreate.mockResolvedValueOnce(SAMPLE_THREAD),
          },
        } as unknown as typeof prisma);
      });

      const res = await PUT(
        makePutRequest(MOCK_POST_ID, { threads: [{ content: "tweet 1" }] }),
        { params: Promise.resolve({ id: MOCK_POST_ID }) }
      );
      expect(res.status).toBe(200);
    });

    it("returns 400 when threads array exceeds 25 items", async () => {
      mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
      const threads = Array(26).fill({ content: "x" });
      const res = await PUT(makePutRequest(MOCK_POST_ID, { threads }), {
        params: Promise.resolve({ id: MOCK_POST_ID }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ── PATCH /api/posts/[id]/threads/[threadId] ──────────────────────────────

  describe("PATCH /api/posts/[id]/threads/[threadId]", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValueOnce(null);
      const res = await PATCH(
        makePatchRequest(MOCK_POST_ID, MOCK_THREAD_ID, { content: "updated" }),
        { params: Promise.resolve({ id: MOCK_POST_ID, threadId: MOCK_THREAD_ID }) }
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 when thread not found", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(null);
      const res = await PATCH(
        makePatchRequest(MOCK_POST_ID, MOCK_THREAD_ID, { content: "updated" }),
        { params: Promise.resolve({ id: MOCK_POST_ID, threadId: MOCK_THREAD_ID }) }
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 when thread belongs to another user", async () => {
      mockThreadFindUnique.mockResolvedValueOnce({
        id: MOCK_THREAD_ID,
        postId: MOCK_POST_ID,
        post: { userId: OTHER_USER_ID },
      });
      const res = await PATCH(
        makePatchRequest(MOCK_POST_ID, MOCK_THREAD_ID, { content: "updated" }),
        { params: Promise.resolve({ id: MOCK_POST_ID, threadId: MOCK_THREAD_ID }) }
      );
      expect(res.status).toBe(404);
    });

    it("updates thread content", async () => {
      mockThreadFindUnique.mockResolvedValueOnce({
        id: MOCK_THREAD_ID,
        postId: MOCK_POST_ID,
        post: { userId: MOCK_USER_ID },
      });
      mockThreadUpdate.mockResolvedValueOnce({ ...SAMPLE_THREAD, content: "updated content" });

      const res = await PATCH(
        makePatchRequest(MOCK_POST_ID, MOCK_THREAD_ID, { content: "updated content" }),
        { params: Promise.resolve({ id: MOCK_POST_ID, threadId: MOCK_THREAD_ID }) }
      );
      const body = await res.json() as { thread: typeof SAMPLE_THREAD };
      expect(res.status).toBe(200);
      expect(body.thread.content).toBe("updated content");
    });

    it("returns 400 when no fields provided", async () => {
      mockThreadFindUnique.mockResolvedValueOnce({
        id: MOCK_THREAD_ID,
        postId: MOCK_POST_ID,
        post: { userId: MOCK_USER_ID },
      });
      const res = await PATCH(
        makePatchRequest(MOCK_POST_ID, MOCK_THREAD_ID, {}),
        { params: Promise.resolve({ id: MOCK_POST_ID, threadId: MOCK_THREAD_ID }) }
      );
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/posts/[id]/threads/[threadId] ─────────────────────────────

  describe("DELETE /api/posts/[id]/threads/[threadId]", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValueOnce(null);
      const res = await DELETE(
        makeDeleteRequest(MOCK_POST_ID, MOCK_THREAD_ID),
        { params: Promise.resolve({ id: MOCK_POST_ID, threadId: MOCK_THREAD_ID }) }
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 when thread not found", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(null);
      const res = await DELETE(
        makeDeleteRequest(MOCK_POST_ID, MOCK_THREAD_ID),
        { params: Promise.resolve({ id: MOCK_POST_ID, threadId: MOCK_THREAD_ID }) }
      );
      expect(res.status).toBe(404);
    });

    it("deletes thread and returns success", async () => {
      mockThreadFindUnique.mockResolvedValueOnce({
        id: MOCK_THREAD_ID,
        postId: MOCK_POST_ID,
        post: { userId: MOCK_USER_ID },
      });
      mockThreadDelete.mockResolvedValueOnce({});

      const res = await DELETE(
        makeDeleteRequest(MOCK_POST_ID, MOCK_THREAD_ID),
        { params: Promise.resolve({ id: MOCK_POST_ID, threadId: MOCK_THREAD_ID }) }
      );
      const body = await res.json() as { success: boolean };
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("returns 429 when rate limited", async () => {
      mockApiLimiter.mockResolvedValueOnce({ success: false });
      const res = await DELETE(
        makeDeleteRequest(MOCK_POST_ID, MOCK_THREAD_ID),
        { params: Promise.resolve({ id: MOCK_POST_ID, threadId: MOCK_THREAD_ID }) }
      );
      expect(res.status).toBe(429);
    });
  });
});
