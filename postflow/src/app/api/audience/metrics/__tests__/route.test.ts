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
    TWITTER: "TWITTER",
    LINKEDIN: "LINKEDIN",
    PINTEREST: "PINTEREST",
    YOUTUBE: "YOUTUBE",
    TIKTOK: "TIKTOK",
    BLUESKY: "BLUESKY",
    MASTODON: "MASTODON",
    TELEGRAM: "TELEGRAM",
    REDDIT: "REDDIT",
    NOSTR: "NOSTR",
    TUMBLR: "TUMBLR",
    WORDPRESS: "WORDPRESS",
    MEDIUM: "MEDIUM",
    GHOST: "GHOST",
    DEVTO: "DEVTO",
    GOOGLE_BUSINESS: "GOOGLE_BUSINESS",
    HASHNODE: "HASHNODE",
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
    socialAccount: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/audience/metrics/route";
import type { AudienceMetricsResponse } from "@/app/api/audience/metrics/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.socialAccount.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/audience/metrics${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function makeFakeAccounts() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return [
    {
      id: "acc-fb-001",
      accountName: "My Facebook Page",
      platform: "FACEBOOK",
      audienceMetrics: [
        { syncedAt: yesterday, followersCount: 1000, followingCount: null },
        { syncedAt: now, followersCount: 1050, followingCount: null },
      ],
    },
    {
      id: "acc-ig-001",
      accountName: "My Instagram",
      platform: "INSTAGRAM",
      audienceMetrics: [
        { syncedAt: yesterday, followersCount: 5000, followingCount: 300 },
        { syncedAt: now, followersCount: 5100, followingCount: 302 },
      ],
    },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/audience/metrics", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  // ── No-filter returns all accounts ────────────────────────────────────────

  it("returns all accounts when no accountId filter is provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makeFakeAccounts());

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as AudienceMetricsResponse;
    expect(Array.isArray(data.accounts)).toBe(true);
    expect(data.accounts).toHaveLength(2);

    // Verify Prisma was called without an id filter
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ id: expect.anything() }),
      })
    );
  });

  // ── accountId filter ──────────────────────────────────────────────────────

  it("filters by accountId when provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const singleAccount = [makeFakeAccounts()[0]];
    mockFindMany.mockResolvedValueOnce(singleAccount);

    const res = await GET(makeRequest({ accountId: "acc-fb-001" }));
    expect(res.status).toBe(200);

    const data = (await res.json()) as AudienceMetricsResponse;
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0].accountId).toBe("acc-fb-001");

    // Verify Prisma was called with the id filter
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "acc-fb-001" }),
      })
    );
  });

  // ── Empty result ──────────────────────────────────────────────────────────

  it("returns an empty accounts array when no active accounts exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as AudienceMetricsResponse;
    expect(data.accounts).toHaveLength(0);
  });

  // ── Response shape ────────────────────────────────────────────────────────

  it("returns correct account shape with accountId, accountName, platform, metrics", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makeFakeAccounts());

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as AudienceMetricsResponse;
    const account = data.accounts[0];

    expect(account).toHaveProperty("accountId");
    expect(account).toHaveProperty("accountName");
    expect(account).toHaveProperty("platform");
    expect(account).toHaveProperty("metrics");
    expect(Array.isArray(account.metrics)).toBe(true);
  });

  it("returns correct metric shape with syncedAt, followersCount, followingCount", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makeFakeAccounts());

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as AudienceMetricsResponse;
    const metrics = data.accounts[0].metrics;

    expect(metrics.length).toBeGreaterThan(0);
    const metric = metrics[0];
    expect(metric).toHaveProperty("syncedAt");
    expect(metric).toHaveProperty("followersCount");
    expect(metric).toHaveProperty("followingCount");
    // syncedAt should be an ISO string
    expect(typeof metric.syncedAt).toBe("string");
    expect(() => new Date(metric.syncedAt)).not.toThrow();
  });

  it("preserves null followingCount for platforms that don't track it (Facebook)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([makeFakeAccounts()[0]]); // Facebook account

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as AudienceMetricsResponse;
    const fbAccount = data.accounts[0];
    expect(fbAccount.platform).toBe("FACEBOOK");
    expect(fbAccount.metrics[0].followingCount).toBeNull();
  });

  it("returns metric data sorted ascending by syncedAt", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(makeFakeAccounts());

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as AudienceMetricsResponse;
    const metrics = data.accounts[0].metrics;

    for (let i = 1; i < metrics.length; i++) {
      const prev = new Date(metrics[i - 1].syncedAt).getTime();
      const curr = new Date(metrics[i].syncedAt).getTime();
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 on unexpected DB error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB down"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Internal server error");
  });
});
