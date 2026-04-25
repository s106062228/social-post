jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  ApprovalStatus: {
    NONE: "NONE",
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
  },
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
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
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/activity-log", () => ({ logActivity: jest.fn() }));
jest.mock("@/lib/notifications", () => ({
  createNotification: jest.fn(),
  NOTIFICATION_TYPES: {
    POST_PUBLISHED: "post.published",
    POST_FAILED: "post.failed",
    POST_PARTIALLY_PUBLISHED: "post.partially_published",
    POST_APPROVAL_REQUESTED: "post.approval_requested",
    POST_APPROVED: "post.approved",
    POST_REJECTED: "post.rejected",
  },
}));

import { NextRequest } from "next/server";
import { POST as requestApproval } from "@/app/api/posts/[id]/request-approval/route";
import { POST as approvePost } from "@/app/api/posts/[id]/approve/route";
import { POST as rejectPost } from "@/app/api/posts/[id]/reject/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.post.findUnique as jest.Mock;
const mockUpdate = prisma.post.update as jest.Mock;

const USER_ID = "user_cuid_123456";
const POST_ID = "cld5e6h0k0000l09s0n1dz9d8";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: USER_ID } });
});

// ── request-approval ─────────────────────────────────────────────────────────

describe("POST /api/posts/[id]/request-approval", () => {
  test("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await requestApproval(
      makeReq("http://localhost/api/posts/clxxx/request-approval"),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(401);
  });

  test("returns 404 for invalid cuid", async () => {
    const res = await requestApproval(
      makeReq("http://localhost/api/posts/not-a-cuid/request-approval"),
      makeParams("not-a-cuid")
    );
    expect(res.status).toBe(404);
  });

  test("returns 404 when post not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await requestApproval(
      makeReq(`http://localhost/api/posts/${POST_ID}/request-approval`),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(404);
  });

  test("returns 404 when post belongs to another user", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: "other_user", status: "DRAFT", approvalStatus: "NONE" });
    const res = await requestApproval(
      makeReq(`http://localhost/api/posts/${POST_ID}/request-approval`),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(404);
  });

  test("returns 409 when post is not DRAFT", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: USER_ID, status: "SCHEDULED", approvalStatus: "NONE" });
    const res = await requestApproval(
      makeReq(`http://localhost/api/posts/${POST_ID}/request-approval`),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/draft/i);
  });

  test("returns 409 when post is already PENDING", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: USER_ID, status: "DRAFT", approvalStatus: "PENDING" });
    const res = await requestApproval(
      makeReq(`http://localhost/api/posts/${POST_ID}/request-approval`),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(409);
  });

  test("sets approvalStatus to PENDING and returns 200", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: USER_ID, status: "DRAFT", approvalStatus: "NONE" });
    mockUpdate.mockResolvedValueOnce({ id: POST_ID, approvalStatus: "PENDING" });
    const res = await requestApproval(
      makeReq(`http://localhost/api/posts/${POST_ID}/request-approval`),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalStatus: "PENDING" }) })
    );
  });

  test("allows resubmission when post was REJECTED", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: USER_ID, status: "DRAFT", approvalStatus: "REJECTED" });
    mockUpdate.mockResolvedValueOnce({ id: POST_ID, approvalStatus: "PENDING" });
    const res = await requestApproval(
      makeReq(`http://localhost/api/posts/${POST_ID}/request-approval`),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(200);
  });
});

// ── approve ───────────────────────────────────────────────────────────────────

describe("POST /api/posts/[id]/approve", () => {
  test("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await approvePost(
      makeReq("http://localhost/api/posts/clxxx/approve"),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(401);
  });

  test("returns 404 when post not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await approvePost(
      makeReq(`http://localhost/api/posts/${POST_ID}/approve`),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(404);
  });

  test("returns 409 when approvalStatus is not PENDING", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: USER_ID, approvalStatus: "NONE" });
    const res = await approvePost(
      makeReq(`http://localhost/api/posts/${POST_ID}/approve`),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/pending/i);
  });

  test("sets approvalStatus to APPROVED and returns 200", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: USER_ID, approvalStatus: "PENDING" });
    mockUpdate.mockResolvedValueOnce({ id: POST_ID, approvalStatus: "APPROVED" });
    const res = await approvePost(
      makeReq(`http://localhost/api/posts/${POST_ID}/approve`),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalStatus: "APPROVED" }) })
    );
  });
});

// ── reject ────────────────────────────────────────────────────────────────────

describe("POST /api/posts/[id]/reject", () => {
  test("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await rejectPost(
      makeReq("http://localhost/api/posts/clxxx/reject"),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(401);
  });

  test("returns 404 when post not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await rejectPost(
      makeReq(`http://localhost/api/posts/${POST_ID}/reject`),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(404);
  });

  test("returns 409 when approvalStatus is not PENDING", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: USER_ID, approvalStatus: "NONE" });
    const res = await rejectPost(
      makeReq(`http://localhost/api/posts/${POST_ID}/reject`),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(409);
  });

  test("rejects without a note", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: USER_ID, approvalStatus: "PENDING" });
    mockUpdate.mockResolvedValueOnce({ id: POST_ID, approvalStatus: "REJECTED", approverNote: null });
    const res = await rejectPost(
      makeReq(`http://localhost/api/posts/${POST_ID}/reject`, {}),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvalStatus: "REJECTED", approverNote: null }),
      })
    );
  });

  test("rejects with a note", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: POST_ID, userId: USER_ID, approvalStatus: "PENDING" });
    mockUpdate.mockResolvedValueOnce({ id: POST_ID, approvalStatus: "REJECTED", approverNote: "Needs revision" });
    const res = await rejectPost(
      makeReq(`http://localhost/api/posts/${POST_ID}/reject`, { note: "Needs revision" }),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvalStatus: "REJECTED", approverNote: "Needs revision" }),
      })
    );
  });

  test("returns 400 when note exceeds 500 chars", async () => {
    const res = await rejectPost(
      makeReq(`http://localhost/api/posts/${POST_ID}/reject`, { note: "x".repeat(501) }),
      makeParams(POST_ID)
    );
    expect(res.status).toBe(400);
  });
});
