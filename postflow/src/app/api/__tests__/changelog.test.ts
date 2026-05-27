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

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    changelogEntry: {
      findMany: jest.fn(),
    },
    userChangelogView: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
  },
}));

import { GET as getChangelog } from "@/app/api/changelog/route";
import { POST as markSeen } from "@/app/api/changelog/mark-seen/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { NextRequest } from "next/server";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockEntryFindMany = prisma.changelogEntry.findMany as jest.Mock;
const mockViewFindMany = prisma.userChangelogView.findMany as jest.Mock;
const mockViewCreateMany = prisma.userChangelogView.createMany as jest.Mock;

const MOCK_USER_ID = "user_changelog_test";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = {
  success: false,
  limit: 100,
  remaining: 0,
  resetAt: new Date(),
};

function makeRequest(url = "http://localhost/api/changelog") {
  return new NextRequest(url);
}

// ── GET /api/changelog ────────────────────────────────────────────────────────

describe("GET /api/changelog", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getChangelog(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await getChangelog(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns only published entries", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const entries = [
      {
        id: "entry1",
        title: "Feature X",
        summary: "A new feature",
        body: "Details",
        type: "feature",
        version: "1.0.0",
        publishedAt: new Date("2026-05-01"),
      },
    ];
    mockEntryFindMany.mockResolvedValueOnce(entries);
    mockViewFindMany.mockResolvedValueOnce([]);

    const res = await getChangelog(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0].title).toBe("Feature X");

    // Confirm the query used `isPublished: true`
    expect(mockEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isPublished: true },
      })
    );
  });

  it("marks entries as seen when user has viewed them", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const entries = [
      {
        id: "entry1",
        title: "A",
        summary: "S",
        body: "B",
        type: "feature",
        version: null,
        publishedAt: new Date(),
      },
      {
        id: "entry2",
        title: "B",
        summary: "S",
        body: "B",
        type: "bugfix",
        version: null,
        publishedAt: new Date(),
      },
    ];
    mockEntryFindMany.mockResolvedValueOnce(entries);
    // Only entry1 has been viewed
    mockViewFindMany.mockResolvedValueOnce([{ entryId: "entry1" }]);

    const res = await getChangelog(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.entries[0].seen).toBe(true);
    expect(json.entries[1].seen).toBe(false);
  });

  it("returns correct unseenCount", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const entries = [
      {
        id: "e1",
        title: "T",
        summary: "S",
        body: "B",
        type: "feature",
        version: null,
        publishedAt: new Date(),
      },
      {
        id: "e2",
        title: "T2",
        summary: "S2",
        body: "B2",
        type: "improvement",
        version: null,
        publishedAt: new Date(),
      },
      {
        id: "e3",
        title: "T3",
        summary: "S3",
        body: "B3",
        type: "bugfix",
        version: null,
        publishedAt: new Date(),
      },
    ];
    mockEntryFindMany.mockResolvedValueOnce(entries);
    // Only e1 seen
    mockViewFindMany.mockResolvedValueOnce([{ entryId: "e1" }]);

    const res = await getChangelog(makeRequest());
    const json = await res.json();
    expect(json.unseenCount).toBe(2);
  });

  it("respects the limit query param", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockEntryFindMany.mockResolvedValueOnce([]);
    mockViewFindMany.mockResolvedValueOnce([]);

    await getChangelog(makeRequest("http://localhost/api/changelog?limit=5"));

    expect(mockEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
  });
});

// ── POST /api/changelog/mark-seen ─────────────────────────────────────────────

describe("POST /api/changelog/mark-seen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await markSeen();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await markSeen();
    expect(res.status).toBe(429);
  });

  it("marks all unseen entries and returns count", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    // Two published entries
    mockEntryFindMany.mockResolvedValueOnce([
      { id: "e1" },
      { id: "e2" },
      { id: "e3" },
    ]);
    // Only e1 already seen
    mockViewFindMany.mockResolvedValueOnce([{ entryId: "e1" }]);
    mockViewCreateMany.mockResolvedValueOnce({ count: 2 });

    const res = await markSeen();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.marked).toBe(2);

    // Confirm createMany was called with e2 and e3
    expect(mockViewCreateMany).toHaveBeenCalledWith({
      data: [
        { userId: MOCK_USER_ID, entryId: "e2" },
        { userId: MOCK_USER_ID, entryId: "e3" },
      ],
      skipDuplicates: true,
    });
  });

  it("returns marked=0 when no published entries exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockEntryFindMany.mockResolvedValueOnce([]);

    const res = await markSeen();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.marked).toBe(0);
    expect(mockViewCreateMany).not.toHaveBeenCalled();
  });

  it("is idempotent — returns marked=0 when all already seen", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    mockEntryFindMany.mockResolvedValueOnce([{ id: "e1" }, { id: "e2" }]);
    // Both already seen
    mockViewFindMany.mockResolvedValueOnce([
      { entryId: "e1" },
      { entryId: "e2" },
    ]);

    const res = await markSeen();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.marked).toBe(0);
    expect(mockViewCreateMany).not.toHaveBeenCalled();
  });
});
