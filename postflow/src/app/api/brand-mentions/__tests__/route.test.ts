import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";
import { GET as GET_STATS } from "../stats/route";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    brandMention: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      findFirst: jest.fn(),
    },
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockFindMany = prisma.brandMention.findMany as jest.MockedFunction<
  typeof prisma.brandMention.findMany
>;
const mockCount = prisma.brandMention.count as jest.MockedFunction<
  typeof prisma.brandMention.count
>;
const mockCreate = prisma.brandMention.create as jest.MockedFunction<
  typeof prisma.brandMention.create
>;
const mockFindFirst = prisma.brandMention.findFirst as jest.MockedFunction<
  typeof prisma.brandMention.findFirst
>;
const mockUpdate = prisma.brandMention.update as jest.MockedFunction<
  typeof prisma.brandMention.update
>;
const mockDelete = prisma.brandMention.delete as jest.MockedFunction<
  typeof prisma.brandMention.delete
>;
const mockPostFindFirst = prisma.post.findFirst as jest.MockedFunction<
  typeof prisma.post.findFirst
>;
const mockLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;

const fakeMention = {
  id: "mention-1",
  userId: "user-1",
  mentionUrl: "https://example.com/mention",
  platform: "Twitter",
  authorName: "TestUser",
  content: "Great product!",
  sentiment: "POSITIVE" as const,
  notes: null,
  responseStatus: "none",
  relatedPostId: null,
  relatedPost: null,
  mentionedAt: new Date("2026-01-15T10:00:00Z"),
  createdAt: new Date("2026-01-15T10:00:00Z"),
  updatedAt: new Date("2026-01-15T10:00:00Z"),
};

function makeReq(
  method: string,
  url: string,
  body?: unknown
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAuth.mockResolvedValue({ user: { id: "user-1" } } as any);
  mockLimiter.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
});

// ── GET list ─────────────────────────────────────────────────────────────────

describe("GET /api/brand-mentions", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeReq("GET", "http://localhost/api/brand-mentions"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await GET(makeReq("GET", "http://localhost/api/brand-mentions"));
    expect(res.status).toBe(429);
  });

  it("returns empty list", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);
    const res = await GET(makeReq("GET", "http://localhost/api/brand-mentions"));
    expect(res.status).toBe(200);
    const data = await res.json() as { mentions: unknown[]; total: number };
    expect(data.mentions).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  it("returns list with correct shape", async () => {
    mockFindMany.mockResolvedValueOnce([fakeMention]);
    mockCount.mockResolvedValueOnce(1);
    const res = await GET(makeReq("GET", "http://localhost/api/brand-mentions"));
    expect(res.status).toBe(200);
    const data = await res.json() as { mentions: typeof fakeMention[] };
    expect(data.mentions[0].content).toBe("Great product!");
    expect(data.mentions[0].sentiment).toBe("POSITIVE");
    expect(data.mentions[0].platform).toBe("Twitter");
  });

  it("applies sentiment filter", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);
    const res = await GET(
      makeReq("GET", "http://localhost/api/brand-mentions?sentiment=NEGATIVE")
    );
    expect(res.status).toBe(200);
    const call = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.sentiment).toBe("NEGATIVE");
  });

  it("applies platform filter", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);
    const res = await GET(
      makeReq("GET", "http://localhost/api/brand-mentions?platform=Reddit")
    );
    expect(res.status).toBe(200);
    const call = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.platform).toBe("Reddit");
  });
});

// ── POST create ──────────────────────────────────────────────────────────────

describe("POST /api/brand-mentions", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq("POST", "http://localhost/api/brand-mentions", { content: "test" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when content missing", async () => {
    const res = await POST(
      makeReq("POST", "http://localhost/api/brand-mentions", { content: "" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when max mentions reached", async () => {
    mockCount.mockResolvedValueOnce(500);
    const res = await POST(
      makeReq("POST", "http://localhost/api/brand-mentions", { content: "test" })
    );
    expect(res.status).toBe(422);
  });

  it("creates mention with defaults", async () => {
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(fakeMention);
    const res = await POST(
      makeReq("POST", "http://localhost/api/brand-mentions", {
        content: "Great product!",
        platform: "Twitter",
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json() as typeof fakeMention;
    expect(data.content).toBe("Great product!");
  });

  it("validates URL format when provided", async () => {
    const res = await POST(
      makeReq("POST", "http://localhost/api/brand-mentions", {
        content: "test",
        mentionUrl: "not-a-valid-url",
      })
    );
    expect(res.status).toBe(400);
  });
});

// ── PATCH update ─────────────────────────────────────────────────────────────

describe("PATCH /api/brand-mentions/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await PATCH(
      makeReq("PATCH", "http://localhost/api/brand-mentions/mention-1", {
        responseStatus: "replied",
      }),
      { params: Promise.resolve({ id: "mention-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when mention not found", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const res = await PATCH(
      makeReq("PATCH", "http://localhost/api/brand-mentions/mention-99", {
        responseStatus: "replied",
      }),
      { params: Promise.resolve({ id: "mention-99" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when owned by another user", async () => {
    mockFindFirst.mockResolvedValueOnce(null); // findFirst with userId check fails
    const res = await PATCH(
      makeReq("PATCH", "http://localhost/api/brand-mentions/mention-1", {
        responseStatus: "acknowledged",
      }),
      { params: Promise.resolve({ id: "mention-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("updates responseStatus successfully", async () => {
    mockFindFirst.mockResolvedValueOnce(fakeMention);
    mockUpdate.mockResolvedValueOnce({ ...fakeMention, responseStatus: "replied" });
    const res = await PATCH(
      makeReq("PATCH", "http://localhost/api/brand-mentions/mention-1", {
        responseStatus: "replied",
      }),
      { params: Promise.resolve({ id: "mention-1" }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as typeof fakeMention;
    expect(data.responseStatus).toBe("replied");
  });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/brand-mentions/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await DELETE(
      makeReq("DELETE", "http://localhost/api/brand-mentions/mention-1"),
      { params: Promise.resolve({ id: "mention-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found / wrong owner", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const res = await DELETE(
      makeReq("DELETE", "http://localhost/api/brand-mentions/mention-99"),
      { params: Promise.resolve({ id: "mention-99" }) }
    );
    expect(res.status).toBe(404);
  });

  it("deletes mention and returns 204", async () => {
    mockFindFirst.mockResolvedValueOnce(fakeMention);
    mockDelete.mockResolvedValueOnce(fakeMention);
    const res = await DELETE(
      makeReq("DELETE", "http://localhost/api/brand-mentions/mention-1"),
      { params: Promise.resolve({ id: "mention-1" }) }
    );
    expect(res.status).toBe(204);
  });
});

// ── GET stats ────────────────────────────────────────────────────────────────

describe("GET /api/brand-mentions/stats", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET_STATS(
      makeReq("GET", "http://localhost/api/brand-mentions/stats")
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await GET_STATS(
      makeReq("GET", "http://localhost/api/brand-mentions/stats")
    );
    expect(res.status).toBe(429);
  });

  it("returns correct shape with zero counts", async () => {
    mockFindMany
      .mockResolvedValueOnce([]) // allMentions
      .mockResolvedValueOnce([]); // recentMentions
    const res = await GET_STATS(
      makeReq("GET", "http://localhost/api/brand-mentions/stats")
    );
    expect(res.status).toBe(200);
    const data = await res.json() as {
      total: number;
      bySentiment: Record<string, number>;
      byPlatform: unknown[];
      byResponseStatus: Record<string, number>;
      recentVolume: { date: string; count: number }[];
    };
    expect(data.total).toBe(0);
    expect(data.bySentiment.positive).toBe(0);
    expect(data.bySentiment.negative).toBe(0);
    expect(data.byPlatform).toHaveLength(0);
    expect(data.recentVolume).toHaveLength(30);
  });

  it("counts sentiments correctly", async () => {
    const mentionsData = [
      { sentiment: "POSITIVE", platform: "Twitter", responseStatus: "replied" },
      { sentiment: "POSITIVE", platform: "Twitter", responseStatus: "none" },
      { sentiment: "NEGATIVE", platform: "Reddit", responseStatus: "none" },
      { sentiment: "NEUTRAL", platform: null, responseStatus: "acknowledged" },
    ];
    mockFindMany
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mentionsData as any) // allMentions
      .mockResolvedValueOnce([]); // recentMentions
    const res = await GET_STATS(
      makeReq("GET", "http://localhost/api/brand-mentions/stats")
    );
    const data = await res.json() as {
      total: number;
      bySentiment: { positive: number; neutral: number; negative: number };
      byResponseStatus: Record<string, number>;
    };
    expect(data.total).toBe(4);
    expect(data.bySentiment.positive).toBe(2);
    expect(data.bySentiment.negative).toBe(1);
    expect(data.bySentiment.neutral).toBe(1);
    expect(data.byResponseStatus.replied).toBe(1);
    expect(data.byResponseStatus.acknowledged).toBe(1);
    expect(data.byResponseStatus.none).toBe(2);
  });

  it("returns 30 days in recentVolume", async () => {
    mockFindMany
      .mockResolvedValueOnce([]) // allMentions
      .mockResolvedValueOnce([]); // recentMentions
    const res = await GET_STATS(
      makeReq("GET", "http://localhost/api/brand-mentions/stats")
    );
    const data = await res.json() as { recentVolume: { date: string; count: number }[] };
    expect(data.recentVolume).toHaveLength(30);
  });

  it("aggregates byPlatform correctly", async () => {
    const mentionsData = [
      { sentiment: "POSITIVE", platform: "Twitter", responseStatus: "none" },
      { sentiment: "NEUTRAL", platform: "Twitter", responseStatus: "none" },
      { sentiment: "NEGATIVE", platform: "Reddit", responseStatus: "none" },
    ];
    mockFindMany
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mentionsData as any)
      .mockResolvedValueOnce([]);
    const res = await GET_STATS(
      makeReq("GET", "http://localhost/api/brand-mentions/stats")
    );
    const data = await res.json() as { byPlatform: { platform: string; count: number }[] };
    expect(data.byPlatform).toHaveLength(2);
    const twitter = data.byPlatform.find((p) => p.platform === "Twitter");
    expect(twitter?.count).toBe(2);
    const reddit = data.byPlatform.find((p) => p.platform === "Reddit");
    expect(reddit?.count).toBe(1);
  });
});
