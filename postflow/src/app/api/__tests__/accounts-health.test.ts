jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  workerLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
    TWITTER: "TWITTER",
    LINKEDIN: "LINKEDIN",
  },
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

jest.mock("@/lib/db", () => ({
  prisma: {
    socialAccount: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: Date.now() + 60000 }),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

// Mock the worker module (token-health.ts exports computeTokenHealthStatus)
jest.mock("@/lib/queue/workers/token-health", () => ({
  computeTokenHealthStatus: jest.fn((tokenExpiresAt: Date | null, isActive: boolean) => {
    if (!isActive) return "invalid";
    if (!tokenExpiresAt) return "ok";
    const now = new Date();
    if (tokenExpiresAt < now) return "expired";
    const daysLeft = (tokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 7) return "expiring";
    return "ok";
  }),
}));

import { GET } from "@/app/api/accounts/health/route";
import { POST as SCAN } from "@/app/api/accounts/health/scan/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockFindMany = prisma.socialAccount.findMany as jest.Mock;
const mockUpdate = prisma.socialAccount.update as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const now = new Date();
const futureExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
const soonExpiry = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);   // 3 days
const pastExpiry = new Date(now.getTime() - 24 * 60 * 60 * 1000);        // 1 day ago

describe("GET /api/accounts/health", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockApiLimiter.mockResolvedValue({ success: true, limit: 100, remaining: 99 });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false, limit: 100, remaining: 0, reset: Date.now() });
    mockFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("returns health array for user accounts", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "acc1",
        accountName: "My Page",
        platform: "FACEBOOK",
        isActive: true,
        tokenExpiresAt: futureExpiry,
        tokenHealthStatus: "ok",
        tokenHealthCheckedAt: new Date(),
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { health: unknown[] };
    expect(body.health).toHaveLength(1);
  });

  it("maps healthStatus as ok for non-expiring token", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "acc1",
        accountName: "My Page",
        platform: "FACEBOOK",
        isActive: true,
        tokenExpiresAt: futureExpiry,
        tokenHealthStatus: "ok",
        tokenHealthCheckedAt: null,
      },
    ]);
    const res = await GET();
    const body = await res.json() as { health: Array<{ healthStatus: string }> };
    expect(body.health[0].healthStatus).toBe("ok");
  });

  it("maps healthStatus as expiring for soon-to-expire token", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "acc1",
        accountName: "My Page",
        platform: "INSTAGRAM",
        isActive: true,
        tokenExpiresAt: soonExpiry,
        tokenHealthStatus: "expiring",
        tokenHealthCheckedAt: new Date(),
      },
    ]);
    const res = await GET();
    const body = await res.json() as { health: Array<{ healthStatus: string }> };
    expect(body.health[0].healthStatus).toBe("expiring");
  });

  it("maps healthStatus as expired for past-expiry token", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "acc1",
        accountName: "Twitter",
        platform: "TWITTER",
        isActive: true,
        tokenExpiresAt: pastExpiry,
        tokenHealthStatus: "expired",
        tokenHealthCheckedAt: new Date(),
      },
    ]);
    const res = await GET();
    const body = await res.json() as { health: Array<{ healthStatus: string }> };
    expect(body.health[0].healthStatus).toBe("expired");
  });

  it("computes daysUntilExpiry correctly", async () => {
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    mockFindMany.mockResolvedValue([
      {
        id: "acc1",
        accountName: "Page",
        platform: "FACEBOOK",
        isActive: true,
        tokenExpiresAt: thirtyDaysFromNow,
        tokenHealthStatus: "ok",
        tokenHealthCheckedAt: null,
      },
    ]);
    const res = await GET();
    const body = await res.json() as { health: Array<{ daysUntilExpiry: number | null }> };
    expect(body.health[0].daysUntilExpiry).toBe(30);
  });

  it("returns null daysUntilExpiry for no-expiry token", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "acc1",
        accountName: "Mastodon",
        platform: "MASTODON",
        isActive: true,
        tokenExpiresAt: null,
        tokenHealthStatus: null,
        tokenHealthCheckedAt: null,
      },
    ]);
    const res = await GET();
    const body = await res.json() as { health: Array<{ daysUntilExpiry: number | null; healthStatus: string }> };
    expect(body.health[0].daysUntilExpiry).toBeNull();
    expect(body.health[0].healthStatus).toBe("ok");
  });
});

describe("POST /api/accounts/health/scan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockApiLimiter.mockResolvedValue({ success: true, limit: 100, remaining: 99 });
    mockUpdate.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await SCAN();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false, limit: 100, remaining: 0, reset: Date.now() });
    mockFindMany.mockResolvedValue([]);
    const res = await SCAN();
    expect(res.status).toBe(429);
  });

  it("returns health array with updated statuses", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "acc1",
        accountName: "My Page",
        platform: "FACEBOOK",
        isActive: true,
        tokenExpiresAt: futureExpiry,
      },
      {
        id: "acc2",
        accountName: "IG Account",
        platform: "INSTAGRAM",
        isActive: true,
        tokenExpiresAt: soonExpiry,
      },
    ]);

    const res = await SCAN();
    expect(res.status).toBe(200);
    const body = await res.json() as { health: Array<{ accountId: string; healthStatus: string; lastCheckedAt: string }> };
    expect(body.health).toHaveLength(2);
    expect(body.health[0].accountId).toBe("acc1");
    expect(body.health[1].accountId).toBe("acc2");
    expect(body.health.every((h) => h.lastCheckedAt != null)).toBe(true);
  });

  it("calls prisma update for each account", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "acc1",
        accountName: "Page",
        platform: "FACEBOOK",
        isActive: true,
        tokenExpiresAt: null,
      },
    ]);
    await SCAN();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc1" },
        data: expect.objectContaining({ tokenHealthStatus: "ok" }),
      })
    );
  });
});
