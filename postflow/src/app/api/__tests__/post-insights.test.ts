jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  workerLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
  PublishStatus: { PUBLISHED: "PUBLISHED", PENDING: "PENDING", FAILED: "FAILED", PROCESSING: "PROCESSING" },
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
    post: { findUnique: jest.fn() },
    publishResult: { findMany: jest.fn() },
    socialAccount: { findMany: jest.fn() },
    postInsights: { upsert: jest.fn() },
  },
}));

jest.mock("@/lib/auth/token-manager", () => ({
  getTokenWithRefresh: jest.fn(),
}));

jest.mock("@/lib/platforms/facebook", () => ({
  facebookAdapter: { getInsights: jest.fn() },
}));

jest.mock("@/lib/platforms/instagram", () => ({
  instagramAdapter: { getInsights: jest.fn() },
}));

jest.mock("@/lib/platforms/threads", () => ({
  threadsAdapter: { getInsights: jest.fn() },
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/posts/[id]/insights/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getTokenWithRefresh } from "@/lib/auth/token-manager";
import { facebookAdapter } from "@/lib/platforms/facebook";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockPublishResultFindMany = prisma.publishResult.findMany as jest.Mock;
const mockSocialAccountFindMany = prisma.socialAccount.findMany as jest.Mock;
const mockPostInsightsUpsert = prisma.postInsights.upsert as jest.Mock;
const mockGetToken = getTokenWithRefresh as jest.Mock;
const mockFBGetInsights = (facebookAdapter as unknown as { getInsights: jest.Mock }).getInsights;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const MOCK_PUBLISH_RESULT = {
  id: "clh3ck8zp0002qr5hyvxckahk",
  platform: "FACEBOOK",
  accountId: "clh3ck8zp0003qr5hyvxckahk",
  platformPostId: "fb-post-123",
  publishedUrl: "https://www.facebook.com/post/123",
  publishedAt: new Date("2026-04-25T10:00:00Z"),
  insights: {
    impressions: 1000,
    reach: 800,
    likes: 50,
    comments: 10,
    shares: 5,
    syncedAt: new Date("2026-04-25T12:00:00Z"),
  },
};

const MOCK_PUBLISH_RESULT_NO_INSIGHTS = {
  ...MOCK_PUBLISH_RESULT,
  id: "clh3ck8zp0004qr5hyvxckahk",
  insights: null,
};

function makeGetRequest(postId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/insights`, {
    method: "GET",
  });
}

function makePostRequest(postId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/insights`, {
    method: "POST",
  });
}

// ── GET /api/posts/[id]/insights ──────────────────────────────────────────────

describe("GET /api/posts/[id]/insights", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid cuid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await GET(makeGetRequest("not-a-cuid"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns empty insights when no published results", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockPublishResultFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      perPlatform: unknown[];
      totals: Record<string, unknown>;
    };
    expect(data.perPlatform).toHaveLength(0);
    expect(data.totals.impressions).toBeNull();
    expect(data.totals.likes).toBeNull();
  });

  it("returns per-platform insights with correct aggregation", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockPublishResultFindMany.mockResolvedValueOnce([MOCK_PUBLISH_RESULT]);
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      perPlatform: Array<{ platform: string; insights: { likes: number } | null }>;
      totals: { likes: number; impressions: number };
    };
    expect(data.perPlatform).toHaveLength(1);
    expect(data.perPlatform[0].platform).toBe("FACEBOOK");
    expect(data.perPlatform[0].insights?.likes).toBe(50);
    expect(data.totals.likes).toBe(50);
    expect(data.totals.impressions).toBe(1000);
  });

  it("returns null totals for metrics with no data across platforms", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockPublishResultFindMany.mockResolvedValueOnce([MOCK_PUBLISH_RESULT_NO_INSIGHTS]);
    const res = await GET(makeGetRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      perPlatform: Array<{ insights: null }>;
      totals: { likes: null };
    };
    expect(data.perPlatform[0].insights).toBeNull();
    expect(data.totals.likes).toBeNull();
  });
});

// ── POST /api/posts/[id]/insights (sync) ──────────────────────────────────────

describe("POST /api/posts/[id]/insights", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makePostRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid cuid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makePostRequest("bad-id"), {
      params: Promise.resolve({ id: "bad-id" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    const res = await POST(makePostRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns synced:0 skipped:0 when no published results", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockPublishResultFindMany.mockResolvedValueOnce([]);
    const res = await POST(makePostRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { synced: number; skipped: number };
    expect(data.synced).toBe(0);
    expect(data.skipped).toBe(0);
  });

  it("syncs insights and upserts records", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockPublishResultFindMany.mockResolvedValueOnce([
      {
        id: MOCK_PUBLISH_RESULT.id,
        platform: "FACEBOOK",
        accountId: MOCK_PUBLISH_RESULT.accountId,
        platformPostId: "fb-post-123",
      },
    ]);
    mockSocialAccountFindMany.mockResolvedValueOnce([
      {
        id: MOCK_PUBLISH_RESULT.accountId,
        encryptedToken: "enc-token",
        tokenExpiresAt: null,
      },
    ]);
    mockGetToken.mockResolvedValueOnce("plain-token");
    mockFBGetInsights.mockResolvedValueOnce({ likes: 42, comments: 7, shares: 3 });
    mockPostInsightsUpsert.mockResolvedValueOnce({});

    const res = await POST(makePostRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { synced: number; skipped: number };
    expect(data.synced).toBe(1);
    expect(data.skipped).toBe(0);
    expect(mockPostInsightsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publishResultId: MOCK_PUBLISH_RESULT.id },
        update: expect.objectContaining({ likes: 42, comments: 7, shares: 3 }),
      })
    );
  });

  it("skips results with no platformPostId", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockPublishResultFindMany.mockResolvedValueOnce([
      {
        id: MOCK_PUBLISH_RESULT.id,
        platform: "FACEBOOK",
        accountId: MOCK_PUBLISH_RESULT.accountId,
        platformPostId: null,
      },
    ]);
    mockSocialAccountFindMany.mockResolvedValueOnce([
      {
        id: MOCK_PUBLISH_RESULT.accountId,
        encryptedToken: "enc-token",
        tokenExpiresAt: null,
      },
    ]);

    const res = await POST(makePostRequest(VALID_POST_ID), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { synced: number; skipped: number };
    expect(data.synced).toBe(0);
    expect(data.skipped).toBe(1);
    expect(mockPostInsightsUpsert).not.toHaveBeenCalled();
  });
});
