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
    contest: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    contestEntry: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    post: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { GET as GET_DETAIL, PATCH, DELETE } from "../[id]/route";
import { GET as GET_ENTRIES, POST as POST_ENTRY } from "../[id]/entries/route";
import { DELETE as DELETE_ENTRY } from "../[id]/entries/[entryId]/route";
import { POST as POST_DRAW } from "../[id]/draw/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockLimiter = apiLimiter as jest.Mock;
const mockContestFindMany = prisma.contest.findMany as jest.Mock;
const mockContestCount = prisma.contest.count as jest.Mock;
const mockContestCreate = prisma.contest.create as jest.Mock;
const mockContestFindFirst = prisma.contest.findFirst as jest.Mock;
const mockContestUpdate = prisma.contest.update as jest.Mock;
const mockContestDelete = prisma.contest.delete as jest.Mock;
const mockEntryFindMany = prisma.contestEntry.findMany as jest.Mock;
const mockEntryCount = prisma.contestEntry.count as jest.Mock;
const mockEntryCreate = prisma.contestEntry.create as jest.Mock;
const mockEntryFindFirst = prisma.contestEntry.findFirst as jest.Mock;
const mockEntryDelete = prisma.contestEntry.delete as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const AUTHED = { user: { id: "user-1" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

const sampleContest = {
  id: "contest-1",
  userId: "user-1",
  name: "Summer Giveaway",
  description: "Win a prize!",
  platform: null,
  postId: null,
  startDate: null,
  endDate: null,
  prizeDescription: "A brand new laptop",
  requiredAction: "comment",
  winnersCount: 1,
  status: "DRAFT",
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { entries: 0 },
};

const sampleEntry = {
  id: "entry-1",
  contestId: "contest-1",
  participantName: "Alice Smith",
  participantHandle: "@alice",
  platform: null,
  entryType: "manual",
  metadata: null,
  isWinner: false,
  pickedAt: null,
  createdAt: new Date(),
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

// ── GET /api/contests ─────────────────────────────────────────────────────────

describe("GET /api/contests", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("returns empty contests list", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { contests: unknown[] };
    expect(body.contests).toEqual([]);
  });

  it("returns contests with entry count", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindMany.mockResolvedValue([sampleContest]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { contests: typeof sampleContest[] };
    expect(body.contests).toHaveLength(1);
    expect(body.contests[0].name).toBe("Summer Giveaway");
    expect(body.contests[0]._count.entries).toBe(0);
  });
});

// ── POST /api/contests ────────────────────────────────────────────────────────

describe("POST /api/contests", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(
      makeReq("http://localhost/api/contests", {
        method: "POST",
        body: JSON.stringify({ name: "Test" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await POST(
      makeReq("http://localhost/api/contests", {
        method: "POST",
        body: JSON.stringify({ name: "Test" }),
      })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid body (missing name)", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestCount.mockResolvedValue(0);
    const res = await POST(
      makeReq("http://localhost/api/contests", {
        method: "POST",
        body: JSON.stringify({ description: "no name" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when max contests reached", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestCount.mockResolvedValue(50);
    const res = await POST(
      makeReq("http://localhost/api/contests", {
        method: "POST",
        body: JSON.stringify({ name: "Another Contest" }),
      })
    );
    expect(res.status).toBe(409);
  });

  it("creates contest successfully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestCount.mockResolvedValue(0);
    mockContestCreate.mockResolvedValue(sampleContest);
    const res = await POST(
      makeReq("http://localhost/api/contests", {
        method: "POST",
        body: JSON.stringify({ name: "Summer Giveaway" }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { name: string };
    expect(body.name).toBe("Summer Giveaway");
  });
});

// ── GET /api/contests/[id] ────────────────────────────────────────────────────

describe("GET /api/contests/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET_DETAIL(
      makeReq("http://localhost/api/contests/contest-1"),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when contest not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(null);
    const res = await GET_DETAIL(
      makeReq("http://localhost/api/contests/bad-id"),
      { params: Promise.resolve({ id: "bad-id" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns contest with entries", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    const detailContest = { ...sampleContest, entries: [sampleEntry] };
    mockContestFindFirst.mockResolvedValue(detailContest);
    const res = await GET_DETAIL(
      makeReq("http://localhost/api/contests/contest-1"),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; entries: unknown[] };
    expect(body.id).toBe("contest-1");
    expect(body.entries).toHaveLength(1);
  });
});

// ── PATCH /api/contests/[id] ──────────────────────────────────────────────────

describe("PATCH /api/contests/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(
      makeReq("http://localhost/api/contests/contest-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "New Name" }),
      }),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when contest not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeReq("http://localhost/api/contests/bad-id", {
        method: "PATCH",
        body: JSON.stringify({ name: "New Name" }),
      }),
      { params: Promise.resolve({ id: "bad-id" }) }
    );
    expect(res.status).toBe(404);
  });

  it("updates name and status", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(sampleContest);
    mockContestUpdate.mockResolvedValue({
      ...sampleContest,
      name: "Updated Name",
      status: "ACTIVE",
    });
    const res = await PATCH(
      makeReq("http://localhost/api/contests/contest-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated Name", status: "ACTIVE" }),
      }),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; status: string };
    expect(body.name).toBe("Updated Name");
    expect(body.status).toBe("ACTIVE");
  });
});

// ── DELETE /api/contests/[id] ─────────────────────────────────────────────────

describe("DELETE /api/contests/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(
      makeReq("http://localhost/api/contests/contest-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when contest not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(null);
    const res = await DELETE(
      makeReq("http://localhost/api/contests/bad-id", { method: "DELETE" }),
      { params: Promise.resolve({ id: "bad-id" }) }
    );
    expect(res.status).toBe(404);
  });

  it("deletes contest and returns 204", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(sampleContest);
    mockContestDelete.mockResolvedValue(sampleContest);
    const res = await DELETE(
      makeReq("http://localhost/api/contests/contest-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(204);
  });
});

// ── GET /api/contests/[id]/entries ────────────────────────────────────────────

describe("GET /api/contests/[id]/entries", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET_ENTRIES(
      makeReq("http://localhost/api/contests/contest-1/entries"),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when contest not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(null);
    const res = await GET_ENTRIES(
      makeReq("http://localhost/api/contests/bad-id/entries"),
      { params: Promise.resolve({ id: "bad-id" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns entries list", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(sampleContest);
    mockEntryFindMany.mockResolvedValue([sampleEntry]);
    mockEntryCount.mockResolvedValue(1);
    const res = await GET_ENTRIES(
      makeReq("http://localhost/api/contests/contest-1/entries"),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: unknown[]; total: number };
    expect(body.entries).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});

// ── POST /api/contests/[id]/entries ──────────────────────────────────────────

describe("POST /api/contests/[id]/entries", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST_ENTRY(
      makeReq("http://localhost/api/contests/contest-1/entries", {
        method: "POST",
        body: JSON.stringify({ participantName: "Alice", participantHandle: "@alice" }),
      }),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when contest not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(null);
    const res = await POST_ENTRY(
      makeReq("http://localhost/api/contests/bad-id/entries", {
        method: "POST",
        body: JSON.stringify({ participantName: "Alice", participantHandle: "@alice" }),
      }),
      { params: Promise.resolve({ id: "bad-id" }) }
    );
    expect(res.status).toBe(404);
  });

  it("adds entry successfully with 201", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(sampleContest);
    mockEntryCount.mockResolvedValue(0);
    mockEntryCreate.mockResolvedValue(sampleEntry);
    const res = await POST_ENTRY(
      makeReq("http://localhost/api/contests/contest-1/entries", {
        method: "POST",
        body: JSON.stringify({ participantName: "Alice Smith", participantHandle: "@alice" }),
      }),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { participantName: string };
    expect(body.participantName).toBe("Alice Smith");
  });
});

// ── DELETE /api/contests/[id]/entries/[entryId] ───────────────────────────────

describe("DELETE /api/contests/[id]/entries/[entryId]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE_ENTRY(
      makeReq("http://localhost/api/contests/contest-1/entries/entry-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "contest-1", entryId: "entry-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when contest not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(null);
    const res = await DELETE_ENTRY(
      makeReq("http://localhost/api/contests/bad-id/entries/entry-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "bad-id", entryId: "entry-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when entry not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(sampleContest);
    mockEntryFindFirst.mockResolvedValue(null);
    const res = await DELETE_ENTRY(
      makeReq("http://localhost/api/contests/contest-1/entries/bad-entry", { method: "DELETE" }),
      { params: Promise.resolve({ id: "contest-1", entryId: "bad-entry" }) }
    );
    expect(res.status).toBe(404);
  });

  it("deletes entry and returns 204", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(sampleContest);
    mockEntryFindFirst.mockResolvedValue(sampleEntry);
    mockEntryDelete.mockResolvedValue(sampleEntry);
    const res = await DELETE_ENTRY(
      makeReq("http://localhost/api/contests/contest-1/entries/entry-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "contest-1", entryId: "entry-1" }) }
    );
    expect(res.status).toBe(204);
  });
});

// ── POST /api/contests/[id]/draw ──────────────────────────────────────────────

describe("POST /api/contests/[id]/draw", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST_DRAW(
      makeReq("http://localhost/api/contests/contest-1/draw", { method: "POST" }),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when contest not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(null);
    const res = await POST_DRAW(
      makeReq("http://localhost/api/contests/contest-1/draw", { method: "POST" }),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when no eligible entries", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(sampleContest);
    mockEntryFindMany.mockResolvedValue([]);
    const res = await POST_DRAW(
      makeReq("http://localhost/api/contests/contest-1/draw", { method: "POST" }),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(409);
  });

  it("draws winners and returns them", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockContestFindFirst.mockResolvedValue(sampleContest);
    mockEntryFindMany
      .mockResolvedValueOnce([sampleEntry]) // eligible entries
      .mockResolvedValueOnce([{ ...sampleEntry, isWinner: true, pickedAt: new Date() }]); // winners after update
    mockTransaction.mockResolvedValue([null, null]);
    const res = await POST_DRAW(
      makeReq("http://localhost/api/contests/contest-1/draw", { method: "POST" }),
      { params: Promise.resolve({ id: "contest-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { winners: unknown[]; total: number };
    expect(body.total).toBe(1);
    expect(body.winners).toHaveLength(1);
  });
});
