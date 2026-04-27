jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  workerLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
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
  MediaType: { NONE: "NONE" },
  PostStatus: { DRAFT: "DRAFT" },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    rssFeed: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    rssItem: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    post: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rss", () => ({
  fetchAndParseFeed: jest.fn(),
  RssFetchError: class RssFetchError extends Error {
    statusCode?: number;
    constructor(msg: string, statusCode?: number) {
      super(msg);
      this.name = "RssFetchError";
      this.statusCode = statusCode;
    }
  },
}));

import { NextRequest } from "next/server";
import { GET as listFeeds, POST as createFeed } from "@/app/api/rss-feeds/route";
import { DELETE as deleteFeed } from "@/app/api/rss-feeds/[id]/route";
import { POST as fetchFeed } from "@/app/api/rss-feeds/[id]/fetch/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { fetchAndParseFeed } from "@/lib/rss";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFeedFindMany = prisma.rssFeed.findMany as jest.Mock;
const mockFeedFindUnique = prisma.rssFeed.findUnique as jest.Mock;
const mockFeedCreate = prisma.rssFeed.create as jest.Mock;
const mockFeedUpdate = prisma.rssFeed.update as jest.Mock;
const mockFeedDelete = prisma.rssFeed.delete as jest.Mock;
const mockRssItemFindUnique = prisma.rssItem.findUnique as jest.Mock;
const mockRssItemCreate = prisma.rssItem.create as jest.Mock;
const mockPostCreate = prisma.post.create as jest.Mock;
const mockFetchAndParseFeed = fetchAndParseFeed as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const VALID_FEED_ID = "clh3ck8zp0001qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_FEED = {
  id: VALID_FEED_ID,
  userId: MOCK_USER_ID,
  name: "Tech Crunch",
  url: "https://techcrunch.com/feed/",
  autoCreate: true,
  lastFetchedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { items: 5 },
};

const PARSED_FEED = {
  title: "Tech Crunch",
  items: [
    {
      guid: "https://techcrunch.com/2026/01/01/example",
      title: "Example article",
      content: "This is the article content.",
      link: "https://techcrunch.com/2026/01/01/example",
      imageUrl: null,
      publishedAt: new Date("2026-01-01"),
    },
  ],
};

// ── GET /api/rss-feeds ────────────────────────────────────────────────────────

describe("GET /api/rss-feeds", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listFeeds();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listFeeds();
    expect(res.status).toBe(429);
  });

  it("returns list of feeds", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindMany.mockResolvedValueOnce([BASE_FEED]);

    const res = await listFeeds();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { feeds: typeof BASE_FEED[] };
    expect(data.feeds).toHaveLength(1);
    expect(data.feeds[0].name).toBe("Tech Crunch");
  });

  it("queries only the authenticated user's feeds", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindMany.mockResolvedValueOnce([]);

    await listFeeds();
    expect(mockFeedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindMany.mockRejectedValueOnce(new Error("DB error"));
    const res = await listFeeds();
    expect(res.status).toBe(500);
  });
});

// ── POST /api/rss-feeds ───────────────────────────────────────────────────────

describe("POST /api/rss-feeds", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/rss-feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createFeed(makeRequest({ name: "Test", url: "https://example.com/feed" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createFeed(makeRequest({ name: "Test", url: "https://example.com/feed" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createFeed(makeRequest({ url: "https://example.com/feed" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when url is not a valid URL", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createFeed(makeRequest({ name: "Test", url: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when feed URL already exists for user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce(BASE_FEED);

    const res = await createFeed(
      makeRequest({ name: "Test", url: "https://techcrunch.com/feed/" })
    );
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("already exists");
  });

  it("returns 201 with created feed", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce(null);
    mockFeedCreate.mockResolvedValueOnce(BASE_FEED);

    const res = await createFeed(
      makeRequest({ name: "Tech Crunch", url: "https://techcrunch.com/feed/" })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { name: string };
    expect(data.name).toBe("Tech Crunch");
  });

  it("creates feed with authenticated user's id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce(null);
    mockFeedCreate.mockResolvedValueOnce(BASE_FEED);

    await createFeed(makeRequest({ name: "Test", url: "https://example.com/rss" }));
    expect(mockFeedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: MOCK_USER_ID }),
      })
    );
  });
});

// ── DELETE /api/rss-feeds/[id] ────────────────────────────────────────────────

describe("DELETE /api/rss-feeds/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id = VALID_FEED_ID) {
    return new NextRequest(`http://localhost:3000/api/rss-feeds/${id}`, { method: "DELETE" });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when feed does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce(null);
    const res = await deleteFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when feed belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce({ ...BASE_FEED, userId: OTHER_USER_ID });
    const res = await deleteFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce(BASE_FEED);
    mockFeedDelete.mockResolvedValueOnce(BASE_FEED);
    const res = await deleteFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(204);
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce(BASE_FEED);
    mockFeedDelete.mockRejectedValueOnce(new Error("DB error"));
    const res = await deleteFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(500);
  });
});

// ── POST /api/rss-feeds/[id]/fetch ────────────────────────────────────────────

describe("POST /api/rss-feeds/[id]/fetch", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id = VALID_FEED_ID) {
    return new NextRequest(`http://localhost:3000/api/rss-feeds/${id}/fetch`, {
      method: "POST",
    });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await fetchFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await fetchFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 when feed does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce(null);
    const res = await fetchFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when feed belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce({ ...BASE_FEED, userId: OTHER_USER_ID });
    const res = await fetchFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(404);
  });

  it("returns 502 on RSS fetch error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce(BASE_FEED);

    const { RssFetchError } = jest.requireMock("@/lib/rss") as {
      RssFetchError: new (msg: string, code?: number) => Error;
    };
    mockFetchAndParseFeed.mockRejectedValueOnce(new RssFetchError("HTTP 404", 404));

    const res = await fetchFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(502);
  });

  it("returns newItems=0 when all items are already imported", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce(BASE_FEED);
    mockFetchAndParseFeed.mockResolvedValueOnce(PARSED_FEED);
    // All items already exist
    mockRssItemFindUnique.mockResolvedValueOnce({ id: "existing-item" });
    mockFeedUpdate.mockResolvedValueOnce(BASE_FEED);

    const res = await fetchFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { newItems: number };
    expect(data.newItems).toBe(0);
  });

  it("returns correct counts for new items with autoCreate=true", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce({ ...BASE_FEED, autoCreate: true });
    mockFetchAndParseFeed.mockResolvedValueOnce(PARSED_FEED);
    // Item not yet imported
    mockRssItemFindUnique.mockResolvedValueOnce(null);
    mockPostCreate.mockResolvedValueOnce({ id: "new-post-id" });
    mockRssItemCreate.mockResolvedValueOnce({ id: "new-item-id" });
    mockFeedUpdate.mockResolvedValueOnce(BASE_FEED);

    const res = await fetchFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { newItems: number; postsCreated: number };
    expect(data.newItems).toBe(1);
    expect(data.postsCreated).toBe(1);
  });

  it("does not create posts when autoCreate=false", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFeedFindUnique.mockResolvedValueOnce({ ...BASE_FEED, autoCreate: false });
    mockFetchAndParseFeed.mockResolvedValueOnce(PARSED_FEED);
    mockRssItemFindUnique.mockResolvedValueOnce(null);
    mockRssItemCreate.mockResolvedValueOnce({ id: "new-item-id" });
    mockFeedUpdate.mockResolvedValueOnce(BASE_FEED);

    const res = await fetchFeed(makeRequest(), makeParams(VALID_FEED_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { newItems: number; postsCreated: number };
    expect(data.newItems).toBe(1);
    expect(data.postsCreated).toBe(0);
    expect(mockPostCreate).not.toHaveBeenCalled();
  });
});
