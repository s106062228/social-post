// ── Mocks (hoisted before imports) ───────────────────────────────────────────

jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
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

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/activity-log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

// Mock Redis for the strict rate limiter used in export
// ioredis exports Redis as a named export, so we mock the whole module
jest.mock("ioredis", () => ({
  Redis: jest.fn().mockImplementation(() => ({
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue("OK"),
  })),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    socialAccount: { findMany: jest.fn() },
    post: { findMany: jest.fn() },
    template: { findMany: jest.fn() },
    campaign: { findMany: jest.fn() },
    tag: { findMany: jest.fn() },
    hashtagGroup: { findMany: jest.fn() },
    activityLog: { findMany: jest.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { GET as exportData } from "@/app/api/account/export/route";
import { DELETE as deleteAccount } from "@/app/api/account/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { NextRequest } from "next/server";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserDelete = prisma.user.delete as jest.Mock;
const mockSocialAccountFindMany = prisma.socialAccount.findMany as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockTemplateFindMany = prisma.template.findMany as jest.Mock;
const mockCampaignFindMany = prisma.campaign.findMany as jest.Mock;
const mockTagFindMany = prisma.tag.findMany as jest.Mock;
const mockHashtagGroupFindMany = prisma.hashtagGroup.findMany as jest.Mock;
const mockActivityLogFindMany = prisma.activityLog.findMany as jest.Mock;

const MOCK_USER_ID = "user_account_test";
const MOCK_USER_EMAIL = "test@example.com";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: MOCK_USER_EMAIL } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_USER = {
  id: MOCK_USER_ID,
  email: MOCK_USER_EMAIL,
  name: "Test User",
  timezone: "UTC",
  emailNotifications: true,
  theme: "system",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const MOCK_SETTINGS = {
  timezone: "UTC",
  emailNotifications: true,
  theme: "system",
  publishingPaused: false,
  publishingPausedReason: null,
};

function makeExportRequest() {
  return new NextRequest("http://localhost/api/account/export");
}

function makeDeleteRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── GET /api/account/export ───────────────────────────────────────────────────

describe("GET /api/account/export", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock: rate limit OK + all DB queries return empty
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockUserFindUnique.mockResolvedValue(MOCK_USER);
    mockSocialAccountFindMany.mockResolvedValue([]);
    mockPostFindMany.mockResolvedValue([]);
    mockTemplateFindMany.mockResolvedValue([]);
    mockCampaignFindMany.mockResolvedValue([]);
    mockTagFindMany.mockResolvedValue([]);
    mockHashtagGroupFindMany.mockResolvedValue([]);
    mockActivityLogFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await exportData(makeExportRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when redis rate limit exceeded", async () => {
    // Override the constructor to return incr=4 (over limit of 3)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis: MockRedis } = require("ioredis") as { Redis: jest.Mock };
    MockRedis.mockImplementationOnce(() => ({
      incr: jest.fn().mockResolvedValue(4),
      expire: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue("OK"),
    }));

    const res = await exportData(makeExportRequest());
    expect(res.status).toBe(429);
  });

  it("returns 200 with content-disposition header on success", async () => {
    // Second call for settings
    mockUserFindUnique.mockResolvedValueOnce(MOCK_USER).mockResolvedValueOnce(MOCK_SETTINGS);

    const res = await exportData(makeExportRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="postflow-export-/);
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("response body contains required data sections", async () => {
    mockUserFindUnique.mockResolvedValueOnce(MOCK_USER).mockResolvedValueOnce(MOCK_SETTINGS);

    const res = await exportData(makeExportRequest());
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toHaveProperty("exportedAt");
    expect(body).toHaveProperty("exportVersion", "1.0");
    expect(body).toHaveProperty("user");
    expect(body).toHaveProperty("settings");
    expect(body).toHaveProperty("socialAccounts");
    expect(body).toHaveProperty("posts");
    expect(body).toHaveProperty("templates");
    expect(body).toHaveProperty("campaigns");
    expect(body).toHaveProperty("tags");
    expect(body).toHaveProperty("hashtagGroups");
    expect(body).toHaveProperty("activityLog");
    expect(body).toHaveProperty("summary");
  });

  it("summary section has correct counts", async () => {
    mockUserFindUnique.mockResolvedValueOnce(MOCK_USER).mockResolvedValueOnce(MOCK_SETTINGS);
    mockPostFindMany.mockResolvedValue([
      { id: "p1", content: "post", mediaType: "NONE", mediaUrls: [], status: "DRAFT",
        scheduledAt: null, createdAt: new Date(), updatedAt: new Date(),
        publishResults: [], tags: [] },
    ]);
    mockTagFindMany.mockResolvedValue([
      { id: "t1", name: "mytag", color: "#000", createdAt: new Date() },
    ]);

    const res = await exportData(makeExportRequest());
    const body = (await res.json()) as { summary: Record<string, number> };

    expect(body.summary.totalPosts).toBe(1);
    expect(body.summary.totalTags).toBe(1);
    expect(body.summary.totalSocialAccounts).toBe(0);
  });

  it("does not expose encryptedToken in social accounts", async () => {
    mockUserFindUnique.mockResolvedValueOnce(MOCK_USER).mockResolvedValueOnce(MOCK_SETTINGS);
    // The DB query itself uses select without encryptedToken — but we verify response
    mockSocialAccountFindMany.mockResolvedValue([
      {
        id: "acc1",
        platform: "FACEBOOK",
        platformAccountId: "fb123",
        accountName: "My Page",
        tokenExpiresAt: null,
        scopes: "pages_manage_posts",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await exportData(makeExportRequest());
    const body = (await res.json()) as { socialAccounts: Record<string, unknown>[] };

    expect(body.socialAccounts).toHaveLength(1);
    expect(body.socialAccounts[0]).not.toHaveProperty("encryptedToken");
    expect(body.socialAccounts[0]).toHaveProperty("platform", "FACEBOOK");
  });
});

// ── DELETE /api/account ───────────────────────────────────────────────────────

describe("DELETE /api/account", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValue({ id: MOCK_USER_ID, email: MOCK_USER_EMAIL });
    mockUserDelete.mockResolvedValue({ id: MOCK_USER_ID });
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await deleteAccount(makeDeleteRequest({ confirmEmail: MOCK_USER_EMAIL }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await deleteAccount(makeDeleteRequest({ confirmEmail: MOCK_USER_EMAIL }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/account", {
      method: "DELETE",
      body: "not-json",
    });
    const res = await deleteAccount(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is missing", async () => {
    const res = await deleteAccount(makeDeleteRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when confirmEmail does not match session email", async () => {
    const res = await deleteAccount(makeDeleteRequest({ confirmEmail: "wrong@example.com" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/does not match/i);
  });

  it("returns 204 and calls prisma.user.delete on success", async () => {
    const res = await deleteAccount(makeDeleteRequest({ confirmEmail: MOCK_USER_EMAIL }));
    expect(res.status).toBe(204);
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: MOCK_USER_ID } });
  });

  it("is case-insensitive for email comparison", async () => {
    const res = await deleteAccount(
      makeDeleteRequest({ confirmEmail: MOCK_USER_EMAIL.toUpperCase() })
    );
    expect(res.status).toBe(204);
  });

  it("returns 404 when user is not found in DB", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await deleteAccount(makeDeleteRequest({ confirmEmail: MOCK_USER_EMAIL }));
    expect(res.status).toBe(404);
  });
});
