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
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/activity-log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/notifications", () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/posts/[id]/assign/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockPostUpdate = prisma.post.update as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockCreateNotification = createNotification as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const ASSIGNEE_ID = "clh3ck8zp0002qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0003qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "owner@example.com" } };

function makeRequest(postId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/posts/[id]/assign", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { assigneeId: ASSIGNEE_ID }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { assigneeId: ASSIGNEE_ID }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 404 for invalid (non-CUID) post ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await PATCH(makeRequest("not-a-cuid", { assigneeId: ASSIGNEE_ID }), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 400 for invalid body (assigneeId is not cuid or null)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { assigneeId: "not-a-valid-id" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid request body");
  });

  // ── Ownership ─────────────────────────────────────────────────────────────

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: OTHER_USER_ID,
      content: "Some content",
      assigneeId: null,
    });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { assigneeId: ASSIGNEE_ID }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { assigneeId: ASSIGNEE_ID }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  // ── Assignee validation ───────────────────────────────────────────────────

  it("returns 404 when assignee user does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Some content",
      assigneeId: null,
    });
    mockUserFindUnique.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { assigneeId: ASSIGNEE_ID }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Assignee not found");
  });

  // ── Set assignee ──────────────────────────────────────────────────────────

  it("sets assigneeId and creates notification for a different user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Hello world",
      assigneeId: null,
    });
    mockUserFindUnique.mockResolvedValueOnce({ id: ASSIGNEE_ID });
    mockPostUpdate.mockResolvedValueOnce({ assigneeId: ASSIGNEE_ID });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { assigneeId: ASSIGNEE_ID }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { assigneeId: string };
    expect(data.assigneeId).toBe(ASSIGNEE_ID);

    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_POST_ID },
        data: { assigneeId: ASSIGNEE_ID },
      })
    );

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ASSIGNEE_ID,
        type: "post_assigned",
      })
    );
  });

  it("does NOT create notification when assigning to self", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Hello world",
      assigneeId: null,
    });
    mockUserFindUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    mockPostUpdate.mockResolvedValueOnce({ assigneeId: MOCK_USER_ID });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { assigneeId: MOCK_USER_ID }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  // ── Clear assignee ────────────────────────────────────────────────────────

  it("clears assigneeId when null is sent", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Some content",
      assigneeId: ASSIGNEE_ID,
    });
    mockPostUpdate.mockResolvedValueOnce({ assigneeId: null });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { assigneeId: null }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { assigneeId: null };
    expect(data.assigneeId).toBeNull();

    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_POST_ID },
        data: { assigneeId: null },
      })
    );
    // No notification when clearing
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await PATCH(makeRequest(MOCK_POST_ID, { assigneeId: ASSIGNEE_ID }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(500);
  });
});
