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
    contentJournalEntry: {
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

import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { GET as GET_ONE, PATCH, DELETE } from "../[id]/route";
import { GET as GET_STATS } from "../stats/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.contentJournalEntry.findMany as jest.Mock;
const mockCount = prisma.contentJournalEntry.count as jest.Mock;
const mockCreate = prisma.contentJournalEntry.create as jest.Mock;
const mockFindFirst = prisma.contentJournalEntry.findFirst as jest.Mock;
const mockUpdate = prisma.contentJournalEntry.update as jest.Mock;
const mockDelete = prisma.contentJournalEntry.delete as jest.Mock;
const mockPostFindFirst = prisma.post.findFirst as jest.Mock;

const AUTHED = { user: { id: "user-1" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

const sampleEntry = {
  id: "entry-1",
  userId: "user-1",
  postId: null,
  title: "Viral video experiment",
  entryType: "INSIGHT",
  content: "Noticed that short videos perform 3x better on Reels",
  rating: 4,
  tags: ["video", "reels"],
  isPublicToTeam: false,
  post: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReq(url: string, opts?: { method?: string; body?: string }): NextRequest {
  return new NextRequest(url, {
    method: opts?.method ?? "GET",
    headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
    body: opts?.body,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────
// GET /api/journal
// ─────────────────────────────────────────────
describe("GET /api/journal", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq("http://localhost/api/journal"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET(makeReq("http://localhost/api/journal"));
    expect(res.status).toBe(429);
  });

  it("returns entries list with pagination", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([sampleEntry]);
    mockCount.mockResolvedValue(1);
    const res = await GET(makeReq("http://localhost/api/journal"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it("filters by entryType", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    await GET(makeReq("http://localhost/api/journal?entryType=SUCCESS"));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entryType: "SUCCESS" }) })
    );
  });
});

// ─────────────────────────────────────────────
// POST /api/journal
// ─────────────────────────────────────────────
describe("POST /api/journal", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(
      makeReq("http://localhost/api/journal", {
        method: "POST",
        body: JSON.stringify({ title: "T", content: "C" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await POST(
      makeReq("http://localhost/api/journal", {
        method: "POST",
        body: JSON.stringify({ title: "T", content: "C" }),
      })
    );
    expect(res.status).toBe(429);
  });

  it("returns 422 when max entries reached", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockCount.mockResolvedValue(500);
    const res = await POST(
      makeReq("http://localhost/api/journal", {
        method: "POST",
        body: JSON.stringify({ title: "T", content: "C" }),
      })
    );
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockCount.mockResolvedValue(0);
    const res = await POST(
      makeReq("http://localhost/api/journal", {
        method: "POST",
        body: JSON.stringify({ title: "" }), // empty title + missing content
      })
    );
    expect(res.status).toBe(400);
  });

  it("creates entry successfully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue(sampleEntry);
    const res = await POST(
      makeReq("http://localhost/api/journal", {
        method: "POST",
        body: JSON.stringify({
          title: "Viral video experiment",
          entryType: "INSIGHT",
          content: "Noticed that short videos perform 3x better on Reels",
          tags: ["video"],
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entry.title).toBe("Viral video experiment");
    expect(body.entry.entryType).toBe("INSIGHT");
  });

  it("returns 404 when postId does not belong to user", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockCount.mockResolvedValue(0);
    mockPostFindFirst.mockResolvedValue(null);
    const res = await POST(
      makeReq("http://localhost/api/journal", {
        method: "POST",
        body: JSON.stringify({
          title: "T",
          content: "C",
          postId: "foreign-post",
        }),
      })
    );
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────
// GET /api/journal/[id]
// ─────────────────────────────────────────────
describe("GET /api/journal/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET_ONE(
      makeReq("http://localhost/api/journal/entry-1"),
      { params: Promise.resolve({ id: "entry-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(null);
    const res = await GET_ONE(
      makeReq("http://localhost/api/journal/entry-1"),
      { params: Promise.resolve({ id: "entry-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns entry successfully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(sampleEntry);
    const res = await GET_ONE(
      makeReq("http://localhost/api/journal/entry-1"),
      { params: Promise.resolve({ id: "entry-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.id).toBe("entry-1");
    expect(body.entry.title).toBe("Viral video experiment");
  });
});

// ─────────────────────────────────────────────
// PATCH /api/journal/[id]
// ─────────────────────────────────────────────
describe("PATCH /api/journal/[id]", () => {
  it("returns 404 when not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeReq("http://localhost/api/journal/entry-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when entry belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    // findFirst filters by userId so returns null for another user's entry
    mockFindFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeReq("http://localhost/api/journal/entry-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("updates entry successfully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(sampleEntry);
    mockUpdate.mockResolvedValue({ ...sampleEntry, title: "Updated title" });
    const res = await PATCH(
      makeReq("http://localhost/api/journal/entry-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated title" }),
      }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.title).toBe("Updated title");
  });
});

// ─────────────────────────────────────────────
// DELETE /api/journal/[id]
// ─────────────────────────────────────────────
describe("DELETE /api/journal/[id]", () => {
  it("returns 404 when not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(null);
    const res = await DELETE(
      makeReq("http://localhost/api/journal/entry-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when ownership check fails", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    // findFirst filters by userId so returns null for another user's entry
    mockFindFirst.mockResolvedValue(null);
    const res = await DELETE(
      makeReq("http://localhost/api/journal/entry-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("deletes entry and returns 204", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(sampleEntry);
    mockDelete.mockResolvedValue(sampleEntry);
    const res = await DELETE(
      makeReq("http://localhost/api/journal/entry-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );
    expect(res.status).toBe(204);
  });
});

// ─────────────────────────────────────────────
// GET /api/journal/stats
// ─────────────────────────────────────────────
describe("GET /api/journal/stats", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET_STATS(makeReq("http://localhost/api/journal/stats"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET_STATS(makeReq("http://localhost/api/journal/stats"));
    expect(res.status).toBe(429);
  });

  it("returns zeroed stats when no entries", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([]);
    const res = await GET_STATS(makeReq("http://localhost/api/journal/stats"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.byType.SUCCESS).toBe(0);
    expect(body.byType.INSIGHT).toBe(0);
    expect(body.topTags).toEqual([]);
    expect(body.avgRating).toBeNull();
  });

  it("returns correct stats shape with data", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([
      { entryType: "INSIGHT", tags: ["video", "reels"], rating: 4 },
      { entryType: "SUCCESS", tags: ["video"], rating: 5 },
      { entryType: "FAILURE", tags: [], rating: null },
    ]);
    const res = await GET_STATS(makeReq("http://localhost/api/journal/stats"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.byType.INSIGHT).toBe(1);
    expect(body.byType.SUCCESS).toBe(1);
    expect(body.byType.FAILURE).toBe(1);
    expect(body.topTags[0].tag).toBe("video");
    expect(body.topTags[0].count).toBe(2);
    expect(body.avgRating).toBe(4.5);
  });
});
