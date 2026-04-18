jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
  PublishStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PUBLISHED: "PUBLISHED",
    FAILED: "FAILED",
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

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    socialAccount: {
      findMany: jest.fn(),
    },
    publishResult: {
      createMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  publishLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/auth/token-manager", () => ({
  getTokenWithRefresh: jest.fn(),
}));

jest.mock("@/lib/platforms/facebook", () => ({
  facebookAdapter: { publish: jest.fn() },
}));

jest.mock("@/lib/platforms/instagram", () => ({
  instagramAdapter: { publish: jest.fn() },
}));

jest.mock("@/lib/platforms/threads", () => ({
  threadsAdapter: { publish: jest.fn() },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/publish/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { publishLimiter } from "@/lib/rate-limit";
import { getTokenWithRefresh } from "@/lib/auth/token-manager";
import { facebookAdapter } from "@/lib/platforms/facebook";

const mockAuth = auth as jest.Mock;
const mockPublishLimiter = publishLimiter as jest.Mock;
const mockGetTokenWithRefresh = getTokenWithRefresh as jest.Mock;
const mockFbPublish = facebookAdapter.publish as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockPostUpdate = prisma.post.update as jest.Mock;
const mockAccountFindMany = prisma.socialAccount.findMany as jest.Mock;
const mockResultCreateMany = prisma.publishResult.createMany as jest.Mock;
const mockResultUpdateMany = prisma.publishResult.updateMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const VALID_ACCOUNT_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 10, remaining: 9, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 10, remaining: 0, resetAt: new Date() };

const BASE_POST = {
  id: VALID_POST_ID,
  userId: MOCK_USER_ID,
  content: "Hello world",
  mediaType: "NONE",
  mediaUrls: [],
  status: "DRAFT",
  scheduledAt: null,
  publishResults: [],
};

const FACEBOOK_ACCOUNT = {
  id: VALID_ACCOUNT_ID,
  userId: MOCK_USER_ID,
  platform: "FACEBOOK",
  platformAccountId: "fb-page-123",
  accountName: "My Page",
  encryptedToken: "enc:token",
  tokenExpiresAt: null,
  isActive: true,
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-valid-json",
  });
}

describe("POST /api/publish", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Auth & rate limit ─────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await POST(makeInvalidJsonRequest());
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 when postId is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await POST(makeRequest({ accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when accountIds is empty array", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when postId is not a valid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await POST(makeRequest({ postId: "not-a-cuid", accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(400);
  });

  // ── Post lookup & ownership ───────────────────────────────────────────────

  it("returns 404 when post is not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 404 when post belongs to a different user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ ...BASE_POST, userId: "clh3ck8zp9999qr5hyvxckahk" });

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(404);
  });

  // ── Conflict states ───────────────────────────────────────────────────────

  it("returns 409 when post is already PUBLISHING", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" });

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post is already being published");
  });

  it("returns 409 when post is already PUBLISHED", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHED" });

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post has already been published");
  });

  // ── Account resolution ────────────────────────────────────────────────────

  it("returns 400 when no valid social accounts are found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockAccountFindMany.mockResolvedValueOnce([]);

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("No valid social accounts found");
  });

  // ── Successful publish ────────────────────────────────────────────────────

  it("returns 200 and PUBLISHED status when all accounts succeed", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockAccountFindMany.mockResolvedValueOnce([FACEBOOK_ACCOUNT]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" }) // transition to PUBLISHING
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHED", publishResults: [] }); // final update
    mockResultCreateMany.mockResolvedValueOnce({ count: 1 });
    mockResultUpdateMany.mockResolvedValue({ count: 1 });
    mockGetTokenWithRefresh.mockResolvedValueOnce("decrypted-token");
    mockFbPublish.mockResolvedValueOnce({
      platformPostId: "fb-post-123",
      publishedUrl: "https://facebook.com/post/123",
      publishedAt: new Date(),
    });

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      post: { status: string };
      summary: { succeeded: number; failed: number; total: number };
    };
    expect(data.post.status).toBe("PUBLISHED");
    expect(data.summary.succeeded).toBe(1);
    expect(data.summary.failed).toBe(0);
    expect(data.summary.total).toBe(1);
  });

  it("transitions post to PUBLISHING then final status in order", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockAccountFindMany.mockResolvedValueOnce([FACEBOOK_ACCOUNT]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" })
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHED", publishResults: [] });
    mockResultCreateMany.mockResolvedValueOnce({ count: 1 });
    mockResultUpdateMany.mockResolvedValue({ count: 1 });
    mockGetTokenWithRefresh.mockResolvedValueOnce("decrypted-token");
    mockFbPublish.mockResolvedValueOnce({
      platformPostId: "fb-post-456",
      publishedAt: new Date(),
    });

    await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));

    // First update: transition to PUBLISHING
    expect(mockPostUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { status: "PUBLISHING" } })
    );
    // Second update: final PUBLISHED status
    expect(mockPostUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: { status: "PUBLISHED" } })
    );
  });

  // ── Partial / full failure ────────────────────────────────────────────────

  it("returns 500 and FAILED status when all accounts fail", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockAccountFindMany.mockResolvedValueOnce([FACEBOOK_ACCOUNT]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" })
      .mockResolvedValueOnce({ ...BASE_POST, status: "FAILED", publishResults: [] });
    mockResultCreateMany.mockResolvedValueOnce({ count: 1 });
    mockResultUpdateMany.mockResolvedValue({ count: 1 });
    mockGetTokenWithRefresh.mockResolvedValueOnce("decrypted-token");
    mockFbPublish.mockRejectedValueOnce(new Error("FB API error"));

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(500);
    const data = (await res.json()) as {
      post: { status: string };
      summary: { succeeded: number; failed: number };
    };
    expect(data.post.status).toBe("FAILED");
    expect(data.summary.succeeded).toBe(0);
    expect(data.summary.failed).toBe(1);
  });

  it("returns 207 and PARTIALLY_PUBLISHED when some accounts succeed and some fail", async () => {
    const secondAccountId = "clh3ck8zp0003qr5hyvxckahk";
    const instagramAccount = {
      ...FACEBOOK_ACCOUNT,
      id: secondAccountId,
      platform: "INSTAGRAM",
      platformAccountId: "ig-123",
    };

    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockAccountFindMany.mockResolvedValueOnce([FACEBOOK_ACCOUNT, instagramAccount]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" })
      .mockResolvedValueOnce({ ...BASE_POST, status: "PARTIALLY_PUBLISHED", publishResults: [] });
    mockResultCreateMany.mockResolvedValueOnce({ count: 2 });
    mockResultUpdateMany.mockResolvedValue({ count: 1 });
    mockGetTokenWithRefresh
      .mockResolvedValueOnce("fb-token")
      .mockResolvedValueOnce("ig-token");
    // Facebook succeeds, Instagram fails
    mockFbPublish.mockResolvedValueOnce({
      platformPostId: "fb-post-789",
      publishedAt: new Date(),
    });
    const { instagramAdapter } = jest.requireMock("@/lib/platforms/instagram") as {
      instagramAdapter: { publish: jest.Mock };
    };
    instagramAdapter.publish.mockRejectedValueOnce(new Error("IG container error"));

    const res = await POST(
      makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID, secondAccountId] })
    );
    expect(res.status).toBe(207);
    const data = (await res.json()) as {
      post: { status: string };
      summary: { succeeded: number; failed: number; total: number };
    };
    expect(data.post.status).toBe("PARTIALLY_PUBLISHED");
    expect(data.summary.succeeded).toBe(1);
    expect(data.summary.failed).toBe(1);
    expect(data.summary.total).toBe(2);
  });

  // ── Missing accounts warning ──────────────────────────────────────────────

  it("includes missingAccountIds when some requested accounts are not found", async () => {
    const missingId = "clh3ck8zp0099qr5hyvxckahk";

    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    // Only FACEBOOK_ACCOUNT is returned — missingId is not found/active
    mockAccountFindMany.mockResolvedValueOnce([FACEBOOK_ACCOUNT]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" })
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHED", publishResults: [] });
    mockResultCreateMany.mockResolvedValueOnce({ count: 1 });
    mockResultUpdateMany.mockResolvedValue({ count: 1 });
    mockGetTokenWithRefresh.mockResolvedValueOnce("decrypted-token");
    mockFbPublish.mockResolvedValueOnce({
      platformPostId: "fb-post-999",
      publishedAt: new Date(),
    });

    const res = await POST(
      makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID, missingId] })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      summary: { missingAccountIds: string[] };
    };
    expect(data.summary.missingAccountIds).toEqual([missingId]);
  });

  // ── Error rollback ────────────────────────────────────────────────────────

  it("marks post as FAILED when an unexpected error occurs after transitioning to PUBLISHING", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockAccountFindMany.mockResolvedValueOnce([FACEBOOK_ACCOUNT]);
    // First update (to PUBLISHING) succeeds
    mockPostUpdate.mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" });
    // createMany throws unexpectedly
    mockResultCreateMany.mockRejectedValueOnce(new Error("DB failure"));
    // Rollback update to FAILED
    mockPostUpdate.mockResolvedValueOnce({ ...BASE_POST, status: "FAILED" });

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    // handleRouteError should return a 500
    expect(res.status).toBe(500);
    // The rollback update should have been called with FAILED
    const lastCall = mockPostUpdate.mock.calls[mockPostUpdate.mock.calls.length - 1] as [
      { where: { id: string }; data: { status: string } }
    ];
    expect(lastCall[0].data.status).toBe("FAILED");
  });
});
