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

jest.mock("@/lib/rate-limit", () => ({
  publishLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/publish/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getTokenWithRefresh } from "@/lib/auth/token-manager";
import { facebookAdapter } from "@/lib/platforms/facebook";
import { publishLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockPublishLimiter = publishLimiter as jest.Mock;
const mockGetTokenWithRefresh = getTokenWithRefresh as jest.Mock;
const mockFbPublish = facebookAdapter.publish as jest.Mock;
const mockFindUnique = prisma.post.findUnique as jest.Mock;
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

const BASE_ACCOUNT = {
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

describe("POST /api/publish", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResultCreateMany.mockResolvedValue({ count: 1 });
    mockResultUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
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

  it("returns 400 when accountIds is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to a different user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_POST, userId: "clh3ck8zp0099qr5hyvxckahk" });
    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when post is already PUBLISHING", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" });
    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/already being published/i);
  });

  it("returns 409 when post is already PUBLISHED", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHED" });
    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/already been published/i);
  });

  it("returns 400 when no valid social accounts found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_POST);
    mockAccountFindMany.mockResolvedValueOnce([]);
    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/no valid social accounts/i);
  });

  it("returns 200 and PUBLISHED status when all platforms succeed", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_POST);
    mockAccountFindMany.mockResolvedValueOnce([BASE_ACCOUNT]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" }) // transition to PUBLISHING
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHED", publishResults: [] }); // final update
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
    expect(data.summary.succeeded).toBe(1);
    expect(data.summary.failed).toBe(0);
    expect(data.summary.total).toBe(1);
  });

  it("returns 500 and FAILED status when all platforms fail", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_POST);
    mockAccountFindMany.mockResolvedValueOnce([BASE_ACCOUNT]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" })
      .mockResolvedValueOnce({ ...BASE_POST, status: "FAILED", publishResults: [] });
    mockGetTokenWithRefresh.mockResolvedValueOnce("decrypted-token");
    mockFbPublish.mockRejectedValueOnce(new Error("API error"));

    const res = await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));
    expect(res.status).toBe(500);
    const data = (await res.json()) as {
      summary: { succeeded: number; failed: number };
    };
    expect(data.summary.succeeded).toBe(0);
    expect(data.summary.failed).toBe(1);
  });

  it("transitions post to PUBLISHING before calling platform adapters", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPublishLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_POST);
    mockAccountFindMany.mockResolvedValueOnce([BASE_ACCOUNT]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" })
      .mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHED", publishResults: [] });
    mockGetTokenWithRefresh.mockResolvedValueOnce("token");
    mockFbPublish.mockResolvedValueOnce({
      platformPostId: "fb-123",
      publishedAt: new Date(),
    });

    await POST(makeRequest({ postId: VALID_POST_ID, accountIds: [VALID_ACCOUNT_ID] }));

    // First update should set status to PUBLISHING
    expect(mockPostUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ status: "PUBLISHING" }) })
    );
  });
});
