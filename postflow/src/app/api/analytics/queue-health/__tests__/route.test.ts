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
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { GET } from "../route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const AUTHED = { user: { id: "user-1" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

beforeEach(() => {
  jest.clearAllMocks();
  (auth as jest.Mock).mockResolvedValue(AUTHED);
  (apiLimiter as jest.Mock).mockResolvedValue(RL_OK);
  (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/analytics/queue-health", () => {
  it("returns 401 when unauthenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    (apiLimiter as jest.Mock).mockResolvedValue(RL_FAIL);
    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("returns empty state when no scheduled posts", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scheduledCount).toBe(0);
    expect(body.queueStatus).toBe("empty");
    expect(body.avgPostsPerDay).toBe(0);
    expect(body.queueRunwayDays).toBe(0);
    expect(body.nextScheduledAt).toBeNull();
    expect(body.platformBreakdown).toEqual([]);
    expect(body.contentGapDays).toHaveLength(14);
  });

  it("returns correct scheduled count and status", async () => {
    const posts = Array.from({ length: 20 }, (_, i) => ({
      scheduledAt: daysFromNow(i + 1),
      publishResults: [{ platform: "FACEBOOK" }],
    }));
    (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scheduledCount).toBe(20);
    expect(body.queueStatus).toBe("healthy");
  });

  it("includes platform breakdown in response", async () => {
    const posts = [
      { scheduledAt: daysFromNow(1), publishResults: [{ platform: "INSTAGRAM" }, { platform: "FACEBOOK" }] },
      { scheduledAt: daysFromNow(2), publishResults: [{ platform: "INSTAGRAM" }] },
    ];
    (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);

    const res = await GET();
    const body = await res.json();
    const breakdown = body.platformBreakdown as { platform: string; count: number }[];
    const instagram = breakdown.find((b) => b.platform === "INSTAGRAM");
    expect(instagram?.count).toBe(2);
  });

  it("filters posts with null scheduledAt", async () => {
    (prisma.post.findMany as jest.Mock).mockResolvedValue([
      { scheduledAt: null, publishResults: [] },
      { scheduledAt: daysFromNow(1), publishResults: [] },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body.scheduledCount).toBe(1); // null scheduledAt filtered before computeQueueHealth
    expect(body.nextScheduledAt).not.toBeNull();
  });

  it("returns 500 on database error", async () => {
    (prisma.post.findMany as jest.Mock).mockRejectedValue(new Error("DB failure"));
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("queried with correct user and status filter", async () => {
    await GET();
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          status: "SCHEDULED",
        }),
      })
    );
  });

  it("returns nextScheduledAt for soonest future post", async () => {
    const soon = daysFromNow(1);
    const later = daysFromNow(5);
    (prisma.post.findMany as jest.Mock).mockResolvedValue([
      { scheduledAt: later, publishResults: [] },
      { scheduledAt: soon, publishResults: [] },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body.nextScheduledAt).toBe(soon.toISOString());
  });
});
