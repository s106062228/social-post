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

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    socialComment: {
      findMany: jest.fn(),
    },
    autoReplyRule: {
      aggregate: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as getStats } from "@/app/api/inbox/stats/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.socialComment.findMany as jest.Mock;
const mockAggregate = prisma.autoReplyRule.aggregate as jest.Mock;

const AUTHED = { user: { id: "user1", email: "user@example.com" } };
const RL_OK = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

function makeGet(url: string) {
  return new NextRequest(url, { method: "GET" });
}

const NOW = new Date("2026-06-05T12:00:00Z");

function makeComment(overrides: Partial<{
  id: string;
  isRead: boolean;
  isReplied: boolean;
  platform: string;
  postedAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? "c1",
    isRead: overrides.isRead ?? false,
    isReplied: overrides.isReplied ?? false,
    platform: overrides.platform ?? "FACEBOOK",
    postedAt: overrides.postedAt ?? NOW,
  };
}

describe("GET /api/inbox/stats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([]);
    mockAggregate.mockResolvedValue({ _sum: { matchCount: 0 } });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getStats(makeGet("http://localhost/api/inbox/stats"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_EXCEEDED);
    const res = await getStats(makeGet("http://localhost/api/inbox/stats"));
    expect(res.status).toBe(429);
  });

  it("returns zeros when no comments", async () => {
    const res = await getStats(makeGet("http://localhost/api/inbox/stats"));
    expect(res.status).toBe(200);
    const data = await res.json() as {
      totalComments: number;
      unreadCount: number;
      repliedCount: number;
      autoRepliedCount: number;
      responseRate: number;
      platformBreakdown: unknown[];
      dailyVolume: unknown[];
    };
    expect(data.totalComments).toBe(0);
    expect(data.unreadCount).toBe(0);
    expect(data.repliedCount).toBe(0);
    expect(data.autoRepliedCount).toBe(0);
    expect(data.responseRate).toBe(0);
    expect(data.platformBreakdown).toHaveLength(0);
    expect(data.dailyVolume).toHaveLength(31); // 30 days + today
  });

  it("counts totalComments correctly", async () => {
    mockFindMany.mockResolvedValue([
      makeComment({ id: "c1" }),
      makeComment({ id: "c2" }),
      makeComment({ id: "c3" }),
    ]);
    const res = await getStats(makeGet("http://localhost/api/inbox/stats"));
    const data = await res.json() as { totalComments: number };
    expect(data.totalComments).toBe(3);
  });

  it("counts unreadCount correctly", async () => {
    mockFindMany.mockResolvedValue([
      makeComment({ id: "c1", isRead: false }),
      makeComment({ id: "c2", isRead: true }),
      makeComment({ id: "c3", isRead: false }),
    ]);
    const res = await getStats(makeGet("http://localhost/api/inbox/stats"));
    const data = await res.json() as { unreadCount: number };
    expect(data.unreadCount).toBe(2);
  });

  it("counts repliedCount correctly", async () => {
    mockFindMany.mockResolvedValue([
      makeComment({ id: "c1", isReplied: true }),
      makeComment({ id: "c2", isReplied: false }),
      makeComment({ id: "c3", isReplied: true }),
    ]);
    const res = await getStats(makeGet("http://localhost/api/inbox/stats"));
    const data = await res.json() as { repliedCount: number };
    expect(data.repliedCount).toBe(2);
  });

  it("returns autoRepliedCount from rule matchCounts", async () => {
    mockAggregate.mockResolvedValue({ _sum: { matchCount: 7 } });
    const res = await getStats(makeGet("http://localhost/api/inbox/stats"));
    const data = await res.json() as { autoRepliedCount: number };
    expect(data.autoRepliedCount).toBe(7);
  });

  it("calculates responseRate correctly", async () => {
    mockFindMany.mockResolvedValue([
      makeComment({ id: "c1", isReplied: true }),
      makeComment({ id: "c2", isReplied: true }),
      makeComment({ id: "c3", isReplied: false }),
      makeComment({ id: "c4", isReplied: false }),
    ]);
    const res = await getStats(makeGet("http://localhost/api/inbox/stats"));
    const data = await res.json() as { responseRate: number };
    expect(data.responseRate).toBe(50); // 2/4 = 50%
  });

  it("returns platformBreakdown grouped by platform", async () => {
    mockFindMany.mockResolvedValue([
      makeComment({ id: "c1", platform: "FACEBOOK", isRead: false, isReplied: false }),
      makeComment({ id: "c2", platform: "FACEBOOK", isRead: true, isReplied: true }),
      makeComment({ id: "c3", platform: "INSTAGRAM", isRead: false, isReplied: false }),
    ]);
    const res = await getStats(makeGet("http://localhost/api/inbox/stats"));
    const data = await res.json() as {
      platformBreakdown: { platform: string; total: number; unread: number; replied: number }[];
    };
    const fb = data.platformBreakdown.find((p) => p.platform === "FACEBOOK");
    const ig = data.platformBreakdown.find((p) => p.platform === "INSTAGRAM");
    expect(fb).toBeDefined();
    expect(fb!.total).toBe(2);
    expect(fb!.unread).toBe(1);
    expect(fb!.replied).toBe(1);
    expect(ig).toBeDefined();
    expect(ig!.total).toBe(1);
  });

  it("returns dailyVolume with 31 entries for last 30 days", async () => {
    const res = await getStats(makeGet("http://localhost/api/inbox/stats"));
    const data = await res.json() as { dailyVolume: { date: string; count: number }[] };
    expect(data.dailyVolume).toHaveLength(31);
    data.dailyVolume.forEach((entry) => {
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("count");
      expect(typeof entry.count).toBe("number");
    });
  });

  it("counts comments in daily volume on the correct day", async () => {
    const commentDate = new Date();
    commentDate.setDate(commentDate.getDate() - 1);
    commentDate.setHours(10, 0, 0, 0);
    mockFindMany.mockResolvedValue([
      makeComment({ id: "c1", postedAt: commentDate }),
      makeComment({ id: "c2", postedAt: commentDate }),
    ]);
    const res = await getStats(makeGet("http://localhost/api/inbox/stats"));
    const data = await res.json() as { dailyVolume: { date: string; count: number }[] };
    const expectedDate = commentDate.toISOString().slice(0, 10);
    const dayEntry = data.dailyVolume.find((d) => d.date === expectedDate);
    expect(dayEntry).toBeDefined();
    expect(dayEntry!.count).toBe(2);
  });
});
