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

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/[id]/retry/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getTokenWithRefresh } from "@/lib/auth/token-manager";
import { facebookAdapter } from "@/lib/platforms/facebook";

const mockAuth = auth as jest.Mock;
const mockGetTokenWithRefresh = getTokenWithRefresh as jest.Mock;
const mockFbPublish = facebookAdapter.publish as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockPostUpdate = prisma.post.update as jest.Mock;
const mockAccountFindMany = prisma.socialAccount.findMany as jest.Mock;
const mockResultUpdateMany = prisma.publishResult.updateMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const VALID_ACCOUNT_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const FAILED_PUBLISH_RESULT = {
  id: "clh3ck8zp0010qr5hyvxckahk",
  postId: VALID_POST_ID,
  platform: "FACEBOOK",
  accountId: VALID_ACCOUNT_ID,
  status: "FAILED",
  error: "Previous error",
  retryCount: 0,
};

const BASE_FAILED_POST = {
  id: VALID_POST_ID,
  userId: MOCK_USER_ID,
  content: "Hello world",
  mediaType: "NONE",
  mediaUrls: [],
  status: "FAILED",
  scheduledAt: null,
  publishResults: [FAILED_PUBLISH_RESULT],
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

function makeRequest(postId = VALID_POST_ID): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/retry`, {
    method: "POST",
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/posts/[id]/retry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("returns 404 when post ID is not a valid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await POST(makeRequest("not-a-cuid"), makeParams("not-a-cuid"));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  // ── Post lookup & ownership ───────────────────────────────────────────────

  it("returns 404 when post is not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to a different user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      ...BASE_FAILED_POST,
      userId: "clh3ck8zp9999qr5hyvxckahk",
    });

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(404);
  });

  // ── Conflict states ───────────────────────────────────────────────────────

  it("returns 409 when post is in DRAFT status", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ ...BASE_FAILED_POST, status: "DRAFT" });

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Only failed or partially published posts can be retried");
  });

  it("returns 409 when post is in PUBLISHED status", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      ...BASE_FAILED_POST,
      status: "PUBLISHED",
      publishResults: [],
    });

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(409);
  });

  it("returns 409 when there are no failed publish results", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      ...BASE_FAILED_POST,
      status: "FAILED",
      publishResults: [],
    });

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("No failed publish results to retry");
  });

  // ── Account resolution ────────────────────────────────────────────────────

  it("returns 400 when no active accounts found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(BASE_FAILED_POST);
    mockAccountFindMany.mockResolvedValueOnce([]);

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("No active accounts found for retry");
  });

  // ── Successful retry ──────────────────────────────────────────────────────

  it("returns 200 and PUBLISHED status when retry succeeds", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(BASE_FAILED_POST);
    mockAccountFindMany.mockResolvedValueOnce([FACEBOOK_ACCOUNT]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_FAILED_POST, status: "PUBLISHING" })
      .mockResolvedValueOnce({ ...BASE_FAILED_POST, status: "PUBLISHED", publishResults: [] });
    mockResultUpdateMany.mockResolvedValue({ count: 1 });
    mockGetTokenWithRefresh.mockResolvedValueOnce("decrypted-token");
    mockFbPublish.mockResolvedValueOnce({
      platformPostId: "fb-post-123",
      publishedUrl: "https://facebook.com/post/123",
      publishedAt: new Date(),
    });

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      post: { status: string };
      summary: { succeeded: number; failed: number; total: number };
    };
    expect(data.post.status).toBe("PUBLISHED");
    expect(data.summary.succeeded).toBe(1);
    expect(data.summary.failed).toBe(0);
  });

  it("allows retry of PARTIALLY_PUBLISHED posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      ...BASE_FAILED_POST,
      status: "PARTIALLY_PUBLISHED",
    });
    mockAccountFindMany.mockResolvedValueOnce([FACEBOOK_ACCOUNT]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_FAILED_POST, status: "PUBLISHING" })
      .mockResolvedValueOnce({ ...BASE_FAILED_POST, status: "PUBLISHED", publishResults: [] });
    mockResultUpdateMany.mockResolvedValue({ count: 1 });
    mockGetTokenWithRefresh.mockResolvedValueOnce("decrypted-token");
    mockFbPublish.mockResolvedValueOnce({
      platformPostId: "fb-post-456",
      publishedAt: new Date(),
    });

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(200);
  });

  // ── Failed retry ──────────────────────────────────────────────────────────

  it("returns 500 and FAILED status when retry fails again", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(BASE_FAILED_POST);
    mockAccountFindMany.mockResolvedValueOnce([FACEBOOK_ACCOUNT]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_FAILED_POST, status: "PUBLISHING" })
      .mockResolvedValueOnce({ ...BASE_FAILED_POST, status: "FAILED", publishResults: [] });
    mockResultUpdateMany.mockResolvedValue({ count: 1 });
    mockGetTokenWithRefresh.mockResolvedValueOnce("decrypted-token");
    mockFbPublish.mockRejectedValueOnce(new Error("FB API still down"));

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(500);
    const data = (await res.json()) as {
      post: { status: string };
      summary: { succeeded: number; failed: number };
    };
    expect(data.post.status).toBe("FAILED");
    expect(data.summary.succeeded).toBe(0);
    expect(data.summary.failed).toBe(1);
  });

  it("increments retryCount when retry fails", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(BASE_FAILED_POST);
    mockAccountFindMany.mockResolvedValueOnce([FACEBOOK_ACCOUNT]);
    mockPostUpdate
      .mockResolvedValueOnce({ ...BASE_FAILED_POST, status: "PUBLISHING" })
      .mockResolvedValueOnce({ ...BASE_FAILED_POST, status: "FAILED", publishResults: [] });
    mockResultUpdateMany.mockResolvedValue({ count: 1 });
    mockGetTokenWithRefresh.mockResolvedValueOnce("decrypted-token");
    mockFbPublish.mockRejectedValueOnce(new Error("Still failing"));

    await POST(makeRequest(), makeParams(VALID_POST_ID));

    const failureUpdateCall = mockResultUpdateMany.mock.calls.find(
      (call) =>
        (call as [{ data: { retryCount?: { increment: number } } }])[0]?.data
          ?.retryCount !== undefined
    );
    expect(failureUpdateCall).toBeDefined();
    const callData = (
      failureUpdateCall as [{ data: { retryCount: { increment: number } } }]
    )[0].data;
    expect(callData.retryCount).toEqual({ increment: 1 });
  });
});
