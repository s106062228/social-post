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
    LINKEDIN: "LINKEDIN",
    TWITTER: "TWITTER",
  },
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
    socialComment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    socialAccount: {
      findMany: jest.fn(),
    },
    publishResult: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/activity-log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/token-manager", () => ({
  getTokenWithRefresh: jest.fn().mockResolvedValue("mock-token"),
}));

jest.mock("@/lib/platforms/facebook", () => ({
  facebookAdapter: {
    fetchComments: jest.fn(),
    addComment: jest.fn(),
  },
}));

jest.mock("@/lib/platforms/instagram", () => ({
  instagramAdapter: {
    fetchComments: jest.fn(),
    addComment: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { POST as syncPost } from "@/app/api/inbox/sync/route";
import { GET as commentsGet } from "@/app/api/inbox/comments/route";
import { PATCH as readPatch } from "@/app/api/inbox/comments/[id]/read/route";
import { POST as replyPost } from "@/app/api/inbox/comments/[id]/reply/route";
import { POST as bulkReadPost } from "@/app/api/inbox/comments/bulk-read/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { facebookAdapter } from "@/lib/platforms/facebook";

const mockAuth = auth as jest.Mock;
const mockSocialComment = prisma.socialComment as jest.Mocked<typeof prisma.socialComment>;
const mockSocialAccount = prisma.socialAccount as jest.Mocked<typeof prisma.socialAccount>;
const mockPublishResult = prisma.publishResult as jest.Mocked<typeof prisma.publishResult>;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFacebookFetchComments = facebookAdapter.fetchComments as jest.Mock;
const mockFacebookAddComment = facebookAdapter.addComment as jest.Mock;

const USER_ID = "user-1";
const AUTHED = { user: { id: USER_ID, email: "test@example.com" } };

const MOCK_COMMENT = {
  id: "comment-1",
  userId: USER_ID,
  accountId: "account-1",
  platformPostId: "fb-post-1",
  platformCommentId: "fb-comment-1",
  authorName: "Alice",
  authorHandle: "alice",
  authorAvatarUrl: null,
  content: "Nice post!",
  isRead: false,
  isReplied: false,
  platform: "FACEBOOK",
  postedAt: new Date("2026-01-01T10:00:00Z"),
  fetchedAt: new Date("2026-01-02T10:00:00Z"),
  createdAt: new Date("2026-01-02T10:00:00Z"),
};

describe("POST /api/inbox/sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/inbox/sync", {
      method: "POST",
      body: "{}",
    });
    const res = await syncPost(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const req = new NextRequest("http://localhost/api/inbox/sync", {
      method: "POST",
      body: "{}",
    });
    const res = await syncPost(req);
    expect(res.status).toBe(429);
  });

  it("returns synced=0 when no active accounts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockSocialAccount.findMany.mockResolvedValueOnce([]);
    const req = new NextRequest("http://localhost/api/inbox/sync", {
      method: "POST",
      body: "{}",
    });
    const res = await syncPost(req);
    expect(res.status).toBe(200);
    const data = await res.json() as { synced: number; platforms: string[] };
    expect(data.synced).toBe(0);
    expect(data.platforms).toEqual([]);
  });

  it("syncs comments from Facebook", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockSocialAccount.findMany.mockResolvedValueOnce([
      {
        id: "account-1",
        userId: USER_ID,
        platform: "FACEBOOK",
        platformAccountId: "page-1",
        accountName: "My Page",
        encryptedToken: "enc",
        tokenExpiresAt: null,
        scopes: "pages_manage_posts",
        isActive: true,
        tokenHealthCheckedAt: null,
        tokenHealthStatus: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPublishResult.findMany.mockResolvedValueOnce([
      {
        id: "result-1",
        platformPostId: "fb-post-1",
        platform: "FACEBOOK",
        accountId: "account-1",
      },
    ]);
    mockFacebookFetchComments.mockResolvedValueOnce([
      {
        platformCommentId: "fb-comment-1",
        authorName: "Alice",
        authorHandle: "alice_fb",
        content: "Great post!",
        postedAt: new Date("2026-01-01T10:00:00Z"),
      },
    ]);
    mockSocialComment.upsert.mockResolvedValueOnce(MOCK_COMMENT);

    const req = new NextRequest("http://localhost/api/inbox/sync", {
      method: "POST",
      body: "{}",
    });
    const res = await syncPost(req);
    expect(res.status).toBe(200);
    const data = await res.json() as { synced: number; platforms: string[] };
    expect(data.synced).toBe(1);
    expect(data.platforms).toContain("FACEBOOK");
  });
});

describe("GET /api/inbox/comments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/inbox/comments");
    const res = await commentsGet(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const req = new NextRequest("http://localhost/api/inbox/comments");
    const res = await commentsGet(req);
    expect(res.status).toBe(429);
  });

  it("returns comments list with totalUnread", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockSocialComment.findMany.mockResolvedValueOnce([MOCK_COMMENT]);
    mockSocialComment.count.mockResolvedValueOnce(1);

    const req = new NextRequest("http://localhost/api/inbox/comments");
    const res = await commentsGet(req);
    expect(res.status).toBe(200);
    const data = await res.json() as { comments: unknown[]; totalUnread: number; nextCursor: string | null };
    expect(data.comments).toHaveLength(1);
    expect(data.totalUnread).toBe(1);
    expect(data.nextCursor).toBeUndefined();
  });

  it("filters by platform", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockSocialComment.findMany.mockResolvedValueOnce([]);
    mockSocialComment.count.mockResolvedValueOnce(0);

    const req = new NextRequest(
      "http://localhost/api/inbox/comments?platform=INSTAGRAM"
    );
    const res = await commentsGet(req);
    expect(res.status).toBe(200);
    const call = mockSocialComment.findMany.mock.calls[0]?.[0] as { where?: { platform?: string } };
    expect(call?.where?.platform).toBe("INSTAGRAM");
  });

  it("filters unread only", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockSocialComment.findMany.mockResolvedValueOnce([]);
    mockSocialComment.count.mockResolvedValueOnce(0);

    const req = new NextRequest(
      "http://localhost/api/inbox/comments?unreadOnly=true"
    );
    const res = await commentsGet(req);
    expect(res.status).toBe(200);
    const call = mockSocialComment.findMany.mock.calls[0]?.[0] as { where?: { isRead?: boolean } };
    expect(call?.where?.isRead).toBe(false);
  });
});

describe("PATCH /api/inbox/comments/[id]/read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/inbox/comments/c1/read", {
      method: "PATCH",
    });
    const res = await readPatch(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when comment not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockSocialComment.findFirst.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/inbox/comments/c1/read", {
      method: "PATCH",
    });
    const res = await readPatch(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(404);
  });

  it("toggles isRead to true", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockSocialComment.findFirst.mockResolvedValueOnce({ ...MOCK_COMMENT, isRead: false });
    mockSocialComment.update.mockResolvedValueOnce({ ...MOCK_COMMENT, isRead: true });

    const req = new NextRequest(
      "http://localhost/api/inbox/comments/comment-1/read",
      { method: "PATCH" }
    );
    const res = await readPatch(req, {
      params: Promise.resolve({ id: "comment-1" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { isRead: boolean };
    expect(data.isRead).toBe(true);
  });

  it("toggles isRead to false when already read", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockSocialComment.findFirst.mockResolvedValueOnce({ ...MOCK_COMMENT, isRead: true });
    mockSocialComment.update.mockResolvedValueOnce({ ...MOCK_COMMENT, isRead: false });

    const req = new NextRequest(
      "http://localhost/api/inbox/comments/comment-1/read",
      { method: "PATCH" }
    );
    const res = await readPatch(req, {
      params: Promise.resolve({ id: "comment-1" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { isRead: boolean };
    expect(data.isRead).toBe(false);
  });
});

describe("POST /api/inbox/comments/[id]/reply", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
    mockFacebookAddComment.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = new NextRequest(
      "http://localhost/api/inbox/comments/c1/reply",
      {
        method: "POST",
        body: JSON.stringify({ reply: "Hello!" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const res = await replyPost(req, {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when comment not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockSocialComment.findFirst.mockResolvedValueOnce(null);
    const req = new NextRequest(
      "http://localhost/api/inbox/comments/c1/reply",
      {
        method: "POST",
        body: JSON.stringify({ reply: "Hello!" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const res = await replyPost(req, {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(404);
  });

  it("replies successfully and marks as replied", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockSocialComment.findFirst.mockResolvedValueOnce({
      ...MOCK_COMMENT,
      account: { id: "account-1", encryptedToken: "enc", platform: "FACEBOOK" },
    });
    mockSocialComment.update.mockResolvedValueOnce({
      ...MOCK_COMMENT,
      isReplied: true,
      isRead: true,
    });

    const req = new NextRequest(
      "http://localhost/api/inbox/comments/comment-1/reply",
      {
        method: "POST",
        body: JSON.stringify({ reply: "Thank you!" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const res = await replyPost(req, {
      params: Promise.resolve({ id: "comment-1" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { success: boolean };
    expect(data.success).toBe(true);
    expect(mockFacebookAddComment).toHaveBeenCalledWith(
      MOCK_COMMENT.platformCommentId,
      "Thank you!",
      "mock-token"
    );
  });

  it("returns 400 when reply is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    const req = new NextRequest(
      "http://localhost/api/inbox/comments/c1/reply",
      {
        method: "POST",
        body: JSON.stringify({ reply: "" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const res = await replyPost(req, {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/inbox/comments/bulk-read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/inbox/comments/bulk-read", {
      method: "POST",
      body: JSON.stringify({ commentIds: ["c1"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await bulkReadPost(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const req = new NextRequest("http://localhost/api/inbox/comments/bulk-read", {
      method: "POST",
      body: JSON.stringify({ commentIds: ["c1"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await bulkReadPost(req);
    expect(res.status).toBe(429);
  });

  it("marks comments as read and returns count", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockSocialComment.updateMany.mockResolvedValueOnce({ count: 3 });

    const req = new NextRequest("http://localhost/api/inbox/comments/bulk-read", {
      method: "POST",
      body: JSON.stringify({ commentIds: ["c1", "c2", "c3"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await bulkReadPost(req);
    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number };
    expect(data.updated).toBe(3);
  });

  it("returns 400 when commentIds is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    const req = new NextRequest("http://localhost/api/inbox/comments/bulk-read", {
      method: "POST",
      body: JSON.stringify({ commentIds: [] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await bulkReadPost(req);
    expect(res.status).toBe(400);
  });
});
