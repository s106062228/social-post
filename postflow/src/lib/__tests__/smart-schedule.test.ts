jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: {
    FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS",
    TWITTER: "TWITTER", BLUESKY: "BLUESKY", MASTODON: "MASTODON",
    LINKEDIN: "LINKEDIN", PINTEREST: "PINTEREST", YOUTUBE: "YOUTUBE",
    TIKTOK: "TIKTOK", REDDIT: "REDDIT", NOSTR: "NOSTR", TUMBLR: "TUMBLR",
    WORDPRESS: "WORDPRESS", MEDIUM: "MEDIUM", GHOST: "GHOST", DEVTO: "DEVTO",
    TELEGRAM: "TELEGRAM", HASHNODE: "HASHNODE",
  },
  PostStatus: {
    DRAFT: "DRAFT", SCHEDULED: "SCHEDULED", PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED", PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED", FAILED: "FAILED",
  },
  PublishStatus: {
    PENDING: "PENDING", PROCESSING: "PROCESSING", PUBLISHED: "PUBLISHED", FAILED: "FAILED",
  },
  Prisma: {
    PrismaClientKnownRequestError: class extends Error { code: string; constructor(m: string, o: { code: string }) { super(m); this.code = o.code; } },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    publishResult: { findMany: jest.fn() },
    post: { findMany: jest.fn() },
    blackoutPeriod: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/blackout", () => ({
  isInBlackout: jest.fn().mockReturnValue(null),
}));

import { getSmartScheduleSuggestions } from "@/lib/smart-schedule";
import { prisma } from "@/lib/db";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Helper: create a publish result with engagement data
function makeResult(publishedAt: Date, likes = 10, comments = 5, shares = 3, reach = 100) {
  return {
    platform: "FACEBOOK" as const,
    publishedAt,
    insights: { impressions: 200, reach, likes, comments, shares },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (mockPrisma.post.findMany as jest.Mock).mockResolvedValue([]);
  (mockPrisma.blackoutPeriod.findMany as jest.Mock).mockResolvedValue([]);
});

describe("getSmartScheduleSuggestions", () => {
  it("returns empty array when no publish history", async () => {
    (mockPrisma.publishResult.findMany as jest.Mock).mockResolvedValue([]);
    const suggestions = await getSmartScheduleSuggestions("user1", [], "UTC");
    expect(suggestions).toHaveLength(0);
  });

  it("returns up to 3 suggestions from history", async () => {
    const now = new Date();
    // Create results at 3 different (hour, dayOfWeek) combos in the past
    const results = [];
    for (let i = 0; i < 5; i++) {
      // Spread results across different days-of-week + hours
      const past = new Date(now.getTime() - (i + 1) * 7 * 86_400_000);
      // Force known UTC hours: 10, 14, 16
      const hrs = [10, 14, 16];
      past.setUTCHours(hrs[i % 3], 0, 0, 0);
      results.push(makeResult(past, 20 + i * 5, 10, 5, 200));
    }
    (mockPrisma.publishResult.findMany as jest.Mock).mockResolvedValue(results);

    const suggestions = await getSmartScheduleSuggestions("user1", [], "UTC");
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    // Each suggestion has required fields
    for (const s of suggestions) {
      expect(s.datetime).toBeDefined();
      expect(s.dayLabel).toBeDefined();
      expect(s.timeLabel).toBeDefined();
      expect(s.reason).toBeDefined();
      expect(typeof s.score).toBe("number");
    }
  });

  it("skips occupied slots (within 15 min buffer)", async () => {
    const now = new Date();
    // Single result: Monday 10:00 UTC
    const mondayRef = new Date(now);
    // Find last Monday
    const daysToMonday = (mondayRef.getUTCDay() + 6) % 7;
    mondayRef.setUTCDate(mondayRef.getUTCDate() - daysToMonday - 7); // last Monday
    mondayRef.setUTCHours(10, 0, 0, 0);
    (mockPrisma.publishResult.findMany as jest.Mock).mockResolvedValue([makeResult(mondayRef)]);

    // Find the next Monday at 10 and mark it as occupied
    const nextMonday = new Date(mondayRef);
    while (nextMonday <= now || nextMonday.getUTCDay() !== 1) {
      nextMonday.setUTCDate(nextMonday.getUTCDate() + 1);
    }
    nextMonday.setUTCHours(10, 0, 0, 0);

    // Mock an existing post at that exact time
    (mockPrisma.post.findMany as jest.Mock).mockResolvedValue([
      { scheduledAt: nextMonday },
    ]);

    const suggestions = await getSmartScheduleSuggestions("user1", [], "UTC");
    // The occupied slot should be skipped; suggestions either find another time or return empty
    for (const s of suggestions) {
      const dt = new Date(s.datetime);
      const diff = Math.abs(dt.getTime() - nextMonday.getTime());
      // Should not be within 15 min of the occupied slot
      expect(diff).toBeGreaterThan(15 * 60 * 1000);
    }
  });

  it("skips slots in blackout periods", async () => {
    const { isInBlackout } = jest.requireMock("@/lib/blackout") as { isInBlackout: jest.Mock };
    // Make every candidate fall in a blackout
    isInBlackout.mockReturnValue({ name: "Holiday" });

    const now = new Date();
    const past = new Date(now.getTime() - 14 * 86_400_000);
    past.setUTCHours(10, 0, 0, 0);
    (mockPrisma.publishResult.findMany as jest.Mock).mockResolvedValue([makeResult(past)]);
    (mockPrisma.blackoutPeriod.findMany as jest.Mock).mockResolvedValue([
      { name: "Holiday", startDate: new Date(), endDate: new Date(now.getTime() + 30 * 86_400_000), isRecurring: false, daysOfWeek: [] },
    ]);

    const suggestions = await getSmartScheduleSuggestions("user1", [], "UTC");
    expect(suggestions).toHaveLength(0);
  });

  it("only returns datetimes in the future", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 14 * 86_400_000);
    past.setUTCHours(10, 0, 0, 0);
    (mockPrisma.publishResult.findMany as jest.Mock).mockResolvedValue([makeResult(past)]);

    const suggestions = await getSmartScheduleSuggestions("user1", [], "UTC");
    for (const s of suggestions) {
      expect(new Date(s.datetime).getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("filters results by platform when platforms specified", async () => {
    (mockPrisma.publishResult.findMany as jest.Mock).mockResolvedValue([]);
    await getSmartScheduleSuggestions("user1", ["FACEBOOK" as const], "UTC");
    const callArgs = (mockPrisma.publishResult.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.platform).toEqual({ in: ["FACEBOOK"] });
  });

  it("does not filter by platform when platforms array is empty", async () => {
    (mockPrisma.publishResult.findMany as jest.Mock).mockResolvedValue([]);
    await getSmartScheduleSuggestions("user1", [], "UTC");
    const callArgs = (mockPrisma.publishResult.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.platform).toBeUndefined();
  });
});
