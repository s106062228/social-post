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
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
    TWITTER: "TWITTER",
    LINKEDIN: "LINKEDIN",
    YOUTUBE: "YOUTUBE",
    TIKTOK: "TIKTOK",
    REDDIT: "REDDIT",
    BLUESKY: "BLUESKY",
    MASTODON: "MASTODON",
    TELEGRAM: "TELEGRAM",
    NOSTR: "NOSTR",
    TUMBLR: "TUMBLR",
    WORDPRESS: "WORDPRESS",
    MEDIUM: "MEDIUM",
    GHOST: "GHOST",
    DEVTO: "DEVTO",
    GOOGLE_BUSINESS: "GOOGLE_BUSINESS",
    HASHNODE: "HASHNODE",
    PINTEREST: "PINTEREST",
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
      count: jest.fn(),
      findMany: jest.fn(),
    },
    socialAccount: {
      count: jest.fn(),
    },
    activityLog: {
      findMany: jest.fn(),
    },
    publishResult: {
      groupBy: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/dashboard/home/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostCount = prisma.post.count as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockAccountCount = prisma.socialAccount.count as jest.Mock;
const mockActivityFindMany = prisma.activityLog.findMany as jest.Mock;
const mockPublishGroupBy = prisma.publishResult.groupBy as jest.Mock;

const MOCK_USER_ID = "user123";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest() {
  return new NextRequest("http://localhost/api/dashboard/home");
}

function setupDefaults() {
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
  // post.count is called 6 times: total, scheduled, publishedThisWeek, failed, drafts + socialAccount.count
  mockPostCount.mockResolvedValue(0);
  mockAccountCount.mockResolvedValue(0);
  mockPostFindMany.mockResolvedValue([]);
  mockActivityFindMany.mockResolvedValue([]);
  mockPublishGroupBy.mockResolvedValue([]);
}

beforeEach(() => {
  jest.resetAllMocks();
  setupDefaults();
});

describe("GET /api/dashboard/home", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns stats shape", async () => {
    mockPostCount
      .mockResolvedValueOnce(10)  // total
      .mockResolvedValueOnce(3)   // scheduled
      .mockResolvedValueOnce(5)   // publishedThisWeek
      .mockResolvedValueOnce(1)   // failed
      .mockResolvedValueOnce(4);  // drafts
    mockAccountCount.mockResolvedValue(2);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stats).toMatchObject({
      totalPosts: 10,
      scheduledCount: 3,
      publishedThisWeek: 5,
      failedCount: 1,
      connectedAccounts: 2,
      draftsCount: 4,
    });
  });

  it("returns upcomingPosts ordered by scheduledAt asc", async () => {
    const now = new Date();
    const future1 = new Date(now.getTime() + 60 * 60 * 1000);
    const future2 = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // First findMany call is upcomingPosts, second is failedPosts
    mockPostFindMany
      .mockResolvedValueOnce([
        { id: "p1", content: "First post", scheduledAt: future1, publishResults: [{ platform: "FACEBOOK" }] },
        { id: "p2", content: "Second post", scheduledAt: future2, publishResults: [] },
      ])
      .mockResolvedValueOnce([]); // failedPosts

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.upcomingPosts).toHaveLength(2);
    expect(body.upcomingPosts[0].id).toBe("p1");
    expect(body.upcomingPosts[0].platforms).toContain("FACEBOOK");
    expect(body.upcomingPosts[1].id).toBe("p2");
  });

  it("returns failedPosts ordered by updatedAt desc", async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 30 * 60 * 1000);

    mockPostFindMany
      .mockResolvedValueOnce([]) // upcomingPosts
      .mockResolvedValueOnce([
        { id: "f1", content: "Newest fail", updatedAt: recent, publishResults: [{ platform: "INSTAGRAM" }] },
        { id: "f2", content: "Older fail", updatedAt: old, publishResults: [] },
      ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.failedPosts).toHaveLength(2);
    expect(body.failedPosts[0].id).toBe("f1");
    expect(body.failedPosts[0].failedPlatforms).toContain("INSTAGRAM");
  });

  it("returns recentActivity with correct count", async () => {
    mockActivityFindMany.mockResolvedValue([
      { id: "a1", action: "post.created", entityType: "post", entityId: "p1", createdAt: new Date() },
      { id: "a2", action: "post.published", entityType: "post", entityId: "p2", createdAt: new Date() },
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.recentActivity).toHaveLength(2);
    expect(body.recentActivity[0]).toMatchObject({
      id: "a1",
      action: "post.created",
      entityType: "post",
    });
  });

  it("returns platformBreakdown shape", async () => {
    mockPublishGroupBy.mockResolvedValue([
      { platform: "FACEBOOK", _count: { id: 15 } },
      { platform: "INSTAGRAM", _count: { id: 8 } },
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.platformBreakdown).toContainEqual(
      expect.objectContaining({ platform: "FACEBOOK", publishedCount: 15 })
    );
    expect(body.platformBreakdown).toContainEqual(
      expect.objectContaining({ platform: "INSTAGRAM", publishedCount: 8 })
    );
    // Sorted descending
    const fb = body.platformBreakdown.findIndex((p: { platform: string }) => p.platform === "FACEBOOK");
    const ig = body.platformBreakdown.findIndex((p: { platform: string }) => p.platform === "INSTAGRAM");
    expect(fb).toBeLessThan(ig);
  });

  it("returns empty arrays when no posts exist", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.upcomingPosts).toEqual([]);
    expect(body.failedPosts).toEqual([]);
    expect(body.recentActivity).toEqual([]);
    expect(body.platformBreakdown).toEqual([]);
  });

  it("excludes platforms with zero published posts from breakdown", async () => {
    mockPublishGroupBy.mockResolvedValue([
      { platform: "TWITTER", _count: { id: 3 } },
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.platformBreakdown.every((p: { publishedCount: number }) => p.publishedCount > 0)).toBe(true);
    expect(body.platformBreakdown.some((p: { platform: string }) => p.platform === "TWITTER")).toBe(true);
  });

  it("handles DB error gracefully", async () => {
    mockPostCount.mockRejectedValue(new Error("DB down"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
