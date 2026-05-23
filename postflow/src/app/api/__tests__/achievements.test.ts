jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    achievement: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/achievements", () => ({
  ...jest.requireActual("@/lib/achievements"),
  checkAndAwardAchievements: jest.fn(),
}));

import { GET as listAchievements } from "@/app/api/achievements/route";
import { POST as checkAchievements } from "@/app/api/achievements/check/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { checkAndAwardAchievements } from "@/lib/achievements";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.achievement.findMany as jest.Mock;
const mockCheckAndAward = checkAndAwardAchievements as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

// ── GET /api/achievements ─────────────────────────────────────────────────────

describe("GET /api/achievements", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listAchievements();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listAchievements();
    expect(res.status).toBe(429);
  });

  it("returns all achievement types with earned=false when user has no achievements", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await listAchievements();
    expect(res.status).toBe(200);
    const data = await res.json() as {
      achievements: { type: string; earned: boolean; awardedAt: string | null }[];
    };
    expect(data.achievements.length).toBe(10);
    expect(data.achievements.every((a) => a.earned === false)).toBe(true);
    expect(data.achievements.every((a) => a.awardedAt === null)).toBe(true);
  });

  it("returns earned=true and awardedAt present for earned achievements", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const awardedAt = new Date("2026-01-01T00:00:00.000Z");
    mockFindMany.mockResolvedValueOnce([{ type: "FIRST_POST", awardedAt }]);

    const res = await listAchievements();
    expect(res.status).toBe(200);
    const data = await res.json() as {
      achievements: { type: string; earned: boolean; awardedAt: string | null }[];
    };
    const firstPost = data.achievements.find((a) => a.type === "FIRST_POST");
    expect(firstPost).toBeDefined();
    expect(firstPost!.earned).toBe(true);
    expect(firstPost!.awardedAt).toBe(awardedAt.toISOString());

    const unearnedItems = data.achievements.filter((a) => a.type !== "FIRST_POST");
    expect(unearnedItems.every((a) => a.earned === false)).toBe(true);
  });

  it("returns achievements sorted alphabetically by type", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await listAchievements();
    const data = await res.json() as { achievements: { type: string }[] };
    const types = data.achievements.map((a) => a.type);
    expect(types).toEqual([...types].sort());
  });

  it("includes label, description, and icon for each achievement", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await listAchievements();
    const data = await res.json() as {
      achievements: { label: string; description: string; icon: string }[];
    };
    for (const achievement of data.achievements) {
      expect(typeof achievement.label).toBe("string");
      expect(typeof achievement.description).toBe("string");
      expect(typeof achievement.icon).toBe("string");
    }
  });
});

// ── POST /api/achievements/check ──────────────────────────────────────────────

describe("POST /api/achievements/check", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await checkAchievements();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await checkAchievements();
    expect(res.status).toBe(429);
  });

  it("returns { awarded: [] } when no new achievements", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCheckAndAward.mockResolvedValueOnce([]);

    const res = await checkAchievements();
    expect(res.status).toBe(200);
    const data = await res.json() as { awarded: string[] };
    expect(data.awarded).toEqual([]);
  });

  it("returns { awarded: ['FIRST_POST'] } when new achievements found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCheckAndAward.mockResolvedValueOnce(["FIRST_POST"]);

    const res = await checkAchievements();
    expect(res.status).toBe(200);
    const data = await res.json() as { awarded: string[] };
    expect(data.awarded).toEqual(["FIRST_POST"]);
  });

  it("calls checkAndAwardAchievements with the current user id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCheckAndAward.mockResolvedValueOnce([]);

    await checkAchievements();
    expect(mockCheckAndAward).toHaveBeenCalledWith(MOCK_USER_ID, expect.anything());
  });

  it("returns multiple awarded keys when multiple achievements unlocked", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCheckAndAward.mockResolvedValueOnce(["FIRST_POST", "FIRST_PUBLISH"]);

    const res = await checkAchievements();
    expect(res.status).toBe(200);
    const data = await res.json() as { awarded: string[] };
    expect(data.awarded).toHaveLength(2);
    expect(data.awarded).toContain("FIRST_POST");
    expect(data.awarded).toContain("FIRST_PUBLISH");
  });
});
