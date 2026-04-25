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
    post: {
      findUnique: jest.fn(),
    },
    postComment: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

import { NextRequest } from "next/server";
import {
  GET as commentsGET,
  POST as commentsPOST,
} from "@/app/api/posts/[id]/comments/route";
import { DELETE as commentDELETE } from "@/app/api/posts/[id]/comments/[commentId]/route";
import { PATCH as commentResolve } from "@/app/api/posts/[id]/comments/[commentId]/resolve/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockCommentFindMany = prisma.postComment.findMany as jest.Mock;
const mockCommentCreate = prisma.postComment.create as jest.Mock;
const mockCommentFindUnique = prisma.postComment.findUnique as jest.Mock;
const mockCommentDelete = prisma.postComment.delete as jest.Mock;
const mockCommentUpdate = prisma.postComment.update as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const COMMENT_ID = "clh3ck8zp0002qr5hyvxckahk";
const USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0003qr5hyvxckahk";

const AUTHED_SESSION = {
  user: { id: USER_ID, email: "user@example.com", name: "Test User" },
};
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const SAMPLE_COMMENT = {
  id: COMMENT_ID,
  userId: USER_ID,
  authorName: "Test User",
  comment: "This is a note",
  resolved: false,
  createdAt: new Date("2026-04-25T10:00:00Z"),
  updatedAt: new Date("2026-04-25T10:00:00Z"),
};

function makeRequest(
  method: string,
  body?: Record<string, unknown>
): NextRequest {
  return new NextRequest(`http://localhost/api/posts/${POST_ID}/comments`, {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
}

function makeCommentRequest(method: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/posts/${POST_ID}/comments/${COMMENT_ID}`,
    { method }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
  mockPostFindUnique.mockResolvedValue({ userId: USER_ID });
});

// ── GET /api/posts/[id]/comments ──────────────────────────────────────────────

describe("GET /api/posts/[id]/comments", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await commentsGET(makeRequest("GET"), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await commentsGET(makeRequest("GET"), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for non-owned post", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ userId: OTHER_USER_ID });
    const res = await commentsGET(makeRequest("GET"), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for invalid post ID", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await commentsGET(makeRequest("GET"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns comments list with currentUserId", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockCommentFindMany.mockResolvedValue([SAMPLE_COMMENT]);
    const res = await commentsGET(makeRequest("GET"), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      comments: typeof SAMPLE_COMMENT[];
      currentUserId: string;
    };
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].comment).toBe("This is a note");
    expect(body.currentUserId).toBe(USER_ID);
  });
});

// ── POST /api/posts/[id]/comments ─────────────────────────────────────────────

describe("POST /api/posts/[id]/comments", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await commentsPOST(makeRequest("POST", { comment: "hello" }), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing comment field", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await commentsPOST(makeRequest("POST", {}), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty comment", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await commentsPOST(makeRequest("POST", { comment: "" }), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a comment and returns 201", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockCommentCreate.mockResolvedValue(SAMPLE_COMMENT);
    const res = await commentsPOST(
      makeRequest("POST", { comment: "This is a note" }),
      { params: Promise.resolve({ id: POST_ID }) }
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { comment: typeof SAMPLE_COMMENT };
    expect(body.comment.comment).toBe("This is a note");
    expect(mockCommentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          postId: POST_ID,
          userId: USER_ID,
          authorName: "Test User",
          comment: "This is a note",
        }),
      })
    );
  });

  it("uses email as authorName when name is not set", async () => {
    mockAuth.mockResolvedValue({
      user: { id: USER_ID, email: "user@example.com", name: null },
    });
    mockCommentCreate.mockResolvedValue({
      ...SAMPLE_COMMENT,
      authorName: "user@example.com",
    });
    const res = await commentsPOST(
      makeRequest("POST", { comment: "hello" }),
      { params: Promise.resolve({ id: POST_ID }) }
    );
    expect(res.status).toBe(201);
    expect(mockCommentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authorName: "user@example.com" }),
      })
    );
  });
});

// ── DELETE /api/posts/[id]/comments/[commentId] ────────────────────────────────

describe("DELETE /api/posts/[id]/comments/[commentId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await commentDELETE(makeCommentRequest("DELETE"), {
      params: Promise.resolve({ id: POST_ID, commentId: COMMENT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when comment does not belong to post", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockCommentFindUnique.mockResolvedValue({
      id: COMMENT_ID,
      userId: USER_ID,
      postId: "different-post",
    });
    const res = await commentDELETE(makeCommentRequest("DELETE"), {
      params: Promise.resolve({ id: POST_ID, commentId: COMMENT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the comment author", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockCommentFindUnique.mockResolvedValue({
      id: COMMENT_ID,
      userId: OTHER_USER_ID,
      postId: POST_ID,
    });
    const res = await commentDELETE(makeCommentRequest("DELETE"), {
      params: Promise.resolve({ id: POST_ID, commentId: COMMENT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("deletes comment and returns success", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockCommentFindUnique.mockResolvedValue({
      id: COMMENT_ID,
      userId: USER_ID,
      postId: POST_ID,
    });
    mockCommentDelete.mockResolvedValue(SAMPLE_COMMENT);
    const res = await commentDELETE(makeCommentRequest("DELETE"), {
      params: Promise.resolve({ id: POST_ID, commentId: COMMENT_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    expect(mockCommentDelete).toHaveBeenCalledWith({ where: { id: COMMENT_ID } });
  });
});

// ── PATCH /api/posts/[id]/comments/[commentId]/resolve ─────────────────────────

describe("PATCH /api/posts/[id]/comments/[commentId]/resolve", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await commentResolve(makeCommentRequest("PATCH"), {
      params: Promise.resolve({ id: POST_ID, commentId: COMMENT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when comment does not belong to post", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockCommentFindUnique.mockResolvedValue({
      id: COMMENT_ID,
      postId: "different-post",
      resolved: false,
    });
    const res = await commentResolve(makeCommentRequest("PATCH"), {
      params: Promise.resolve({ id: POST_ID, commentId: COMMENT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("toggles resolved to true and returns updated comment", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockCommentFindUnique.mockResolvedValue({
      id: COMMENT_ID,
      postId: POST_ID,
      resolved: false,
    });
    const resolved = { ...SAMPLE_COMMENT, resolved: true };
    mockCommentUpdate.mockResolvedValue(resolved);
    const res = await commentResolve(makeCommentRequest("PATCH"), {
      params: Promise.resolve({ id: POST_ID, commentId: COMMENT_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { comment: typeof SAMPLE_COMMENT };
    expect(body.comment.resolved).toBe(true);
    expect(mockCommentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: COMMENT_ID },
        data: { resolved: true },
      })
    );
  });

  it("toggles resolved to false (reopen)", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockCommentFindUnique.mockResolvedValue({
      id: COMMENT_ID,
      postId: POST_ID,
      resolved: true,
    });
    const reopened = { ...SAMPLE_COMMENT, resolved: false };
    mockCommentUpdate.mockResolvedValue(reopened);
    const res = await commentResolve(makeCommentRequest("PATCH"), {
      params: Promise.resolve({ id: POST_ID, commentId: COMMENT_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { comment: typeof SAMPLE_COMMENT };
    expect(body.comment.resolved).toBe(false);
    expect(mockCommentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { resolved: false } })
    );
  });
});
