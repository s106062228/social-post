jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
  PostStatus: {
    DRAFT: "DRAFT", SCHEDULED: "SCHEDULED", PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED", PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED", FAILED: "FAILED",
  },
  Platform: {
    FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS",
    LINKEDIN: "LINKEDIN", PINTEREST: "PINTEREST", YOUTUBE: "YOUTUBE",
    TIKTOK: "TIKTOK", TWITTER: "TWITTER", BLUESKY: "BLUESKY",
    MASTODON: "MASTODON", TELEGRAM: "TELEGRAM", REDDIT: "REDDIT",
    NOSTR: "NOSTR", TUMBLR: "TUMBLR", WORDPRESS: "WORDPRESS",
    MEDIUM: "MEDIUM", GHOST: "GHOST", DEVTO: "DEVTO", HASHNODE: "HASHNODE",
  },
  ApprovalStatus: { NONE: "NONE", PENDING: "PENDING", APPROVED: "APPROVED", REJECTED: "REJECTED" },
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) { super(msg); this.code = opts.code; }
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
    post: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tag: { findMany: jest.fn() },
    postVersion: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/sanitize", () => ({
  sanitizePostContent: jest.fn((s: string) => s.trim()),
}));

jest.mock("@/lib/queue/scheduler", () => ({
  schedulePost: jest.fn(),
  cancelScheduledPost: jest.fn(),
  scheduleReminder: jest.fn(),
  cancelReminder: jest.fn(),
}));

jest.mock("@/lib/activity-log", () => ({ logActivity: jest.fn() }));

import { NextRequest } from "next/server";
import { POST as createPost } from "@/app/api/posts/route";
import { PATCH as updatePost } from "@/app/api/posts/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostCreate = prisma.post.create as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockPostUpdate = prisma.post.update as jest.Mock;
const mockTagFindMany = prisma.tag.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const SESSION = { user: { id: USER_ID } };

const BASE_POST = {
  id: POST_ID,
  userId: USER_ID,
  content: "hello world",
  mediaType: "IMAGE",
  mediaUrls: ["https://example.com/img.jpg"],
  altTexts: [],
  status: "DRAFT",
  scheduledAt: null,
  tags: [],
  publishResults: [],
  starred: false,
  isEvergreen: false,
  approvalStatus: "NONE",
  approverNote: null,
  sentiment: null,
  sentimentScore: null,
  firstComment: null,
  language: null,
  archivedAt: null,
  expiresAt: null,
  recycleInterval: null,
  lastRecycledAt: null,
  pillarId: null,
  assigneeId: null,
  reminderMinutes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockApiLimiter.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: Date.now() + 60000 });
  mockTagFindMany.mockResolvedValue([]);
  mockTransaction.mockImplementation(async (ops: unknown[]) =>
    Promise.all(ops.map((op) => Promise.resolve(op)))
  );
});

// ── POST /api/posts ────────────────────────────────────────────────────────────

describe("POST /api/posts — altTexts", () => {
  function req(body: unknown) {
    return new NextRequest("http://localhost/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  test("creates post with altTexts saved", async () => {
    const created = { ...BASE_POST, altTexts: ["A cat sitting on a mat"] };
    mockPostCreate.mockResolvedValue(created);

    const res = await createPost(
      req({
        content: "hello world",
        mediaType: "IMAGE",
        mediaUrls: ["https://example.com/img.jpg"],
        altTexts: ["A cat sitting on a mat"],
      })
    );
    expect(res.status).toBe(201);

    const data = (await res.json()) as { altTexts: string[] };
    expect(data.altTexts).toEqual(["A cat sitting on a mat"]);

    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          altTexts: ["A cat sitting on a mat"],
        }),
      })
    );
  });

  test("defaults altTexts to empty array when not provided", async () => {
    mockPostCreate.mockResolvedValue({ ...BASE_POST, altTexts: [] });

    const res = await createPost(
      req({ content: "hello world", mediaType: "IMAGE", mediaUrls: ["https://example.com/img.jpg"] })
    );
    expect(res.status).toBe(201);

    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ altTexts: [] }),
      })
    );
  });

  test("rejects altTexts items exceeding 2200 chars", async () => {
    const res = await createPost(
      req({
        content: "hello world",
        mediaType: "IMAGE",
        mediaUrls: ["https://example.com/img.jpg"],
        altTexts: ["x".repeat(2201)],
      })
    );
    expect(res.status).toBe(400);
  });

  test("rejects altTexts array with more than 10 items", async () => {
    const res = await createPost(
      req({
        content: "hello world",
        mediaType: "IMAGE",
        mediaUrls: ["https://example.com/img.jpg"],
        altTexts: Array(11).fill("desc"),
      })
    );
    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/posts/[id] ──────────────────────────────────────────────────────

describe("PATCH /api/posts/[id] — altTexts", () => {
  function patchReq(body: unknown) {
    return new NextRequest(`http://localhost/api/posts/${POST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function params() {
    return { params: Promise.resolve({ id: POST_ID }) };
  }

  test("updates altTexts on existing post", async () => {
    const updatedPost = { ...BASE_POST, altTexts: ["Updated alt text"], publishResults: [] };
    mockPostFindUnique.mockResolvedValue(BASE_POST);
    mockPostUpdate.mockResolvedValue(updatedPost);

    const res = await updatePost(patchReq({ altTexts: ["Updated alt text"] }), params());
    expect(res.status).toBe(200);

    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ altTexts: ["Updated alt text"] }),
      })
    );
  });

  test("clears altTexts when empty array provided", async () => {
    const postWithAlt = { ...BASE_POST, altTexts: ["old alt"] };
    const updatedPost = { ...BASE_POST, altTexts: [], publishResults: [] };
    mockPostFindUnique.mockResolvedValue(postWithAlt);
    mockPostUpdate.mockResolvedValue(updatedPost);

    const res = await updatePost(patchReq({ altTexts: [] }), params());
    expect(res.status).toBe(200);

    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ altTexts: [] }),
      })
    );
  });

  test("rejects altTexts item exceeding 2200 chars", async () => {
    mockPostFindUnique.mockResolvedValue(BASE_POST);

    const res = await updatePost(patchReq({ altTexts: ["x".repeat(2201)] }), params());
    expect(res.status).toBe(400);
  });

  test("returns 404 when post not found", async () => {
    mockPostFindUnique.mockResolvedValue(null);

    const res = await updatePost(patchReq({ altTexts: ["some alt"] }), params());
    expect(res.status).toBe(404);
  });
});
