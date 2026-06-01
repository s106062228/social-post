jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
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
    feedToken: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/rss-feed", () => ({
  generateRssFeed: jest.fn().mockReturnValue("<rss>mock rss feed</rss>"),
  generateAtomFeed: jest.fn().mockReturnValue("<?xml version='1.0'?><feed>mock atom feed</feed>"),
}));

import { NextRequest } from "next/server";
import { GET as rssGET } from "@/app/api/feed/rss/route";
import { GET as atomGET } from "@/app/api/feed/atom/route";
import { GET as tokenGET, DELETE as tokenDELETE } from "@/app/api/feed/token/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { generateRssFeed, generateAtomFeed } from "@/lib/rss-feed";

const mockAuth = auth as jest.Mock;
const mockFeedTokenFindUnique = prisma.feedToken.findUnique as jest.Mock;
const mockFeedTokenUpsert = prisma.feedToken.upsert as jest.Mock;
const mockFeedTokenDeleteMany = prisma.feedToken.deleteMany as jest.Mock;
const mockFeedTokenCreate = prisma.feedToken.create as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateRssFeed = generateRssFeed as jest.Mock;
const mockGenerateAtomFeed = generateAtomFeed as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = {
  user: { id: MOCK_USER_ID, name: "Test User", email: "user@example.com" },
};
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };
const SAMPLE_TOKEN = "feed-token-abc123xyz";

const SAMPLE_POSTS = [
  {
    id: "post-1",
    content: "Hello world! #socialmedia",
    status: "PUBLISHED",
    createdAt: new Date("2026-05-01T10:00:00Z"),
    updatedAt: new Date("2026-05-01T12:00:00Z"),
    publishResults: [
      { publishedAt: new Date("2026-05-01T12:00:00Z"), platform: "FACEBOOK" },
    ],
  },
  {
    id: "post-2",
    content: "Another published post",
    status: "PUBLISHED",
    createdAt: new Date("2026-04-20T09:00:00Z"),
    updatedAt: new Date("2026-04-20T11:00:00Z"),
    publishResults: [
      { publishedAt: new Date("2026-04-20T11:00:00Z"), platform: "INSTAGRAM" },
    ],
  },
];

function makeRssRequest(url = "http://localhost/api/feed/rss"): NextRequest {
  return new NextRequest(url);
}

function makeAtomRequest(url = "http://localhost/api/feed/atom"): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPostFindMany.mockResolvedValue(SAMPLE_POSTS);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
});

// ── /api/feed/rss ─────────────────────────────────────────────────────────────

describe("GET /api/feed/rss", () => {
  it("returns 401 when not authenticated and no token provided", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await rssGET(makeRssRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid ?token= query param", async () => {
    mockAuth.mockResolvedValue(null);
    mockFeedTokenFindUnique.mockResolvedValue(null);
    const res = await rssGET(makeRssRequest("http://localhost/api/feed/rss?token=bad-token"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await rssGET(makeRssRequest());
    expect(res.status).toBe(429);
  });

  it("authenticates via session and returns RSS feed", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await rssGET(makeRssRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/rss+xml");
  });

  it("authenticates via valid ?token= query param", async () => {
    mockAuth.mockResolvedValue(null);
    mockFeedTokenFindUnique.mockResolvedValue({ userId: MOCK_USER_ID });
    mockUserFindUnique.mockResolvedValue({ name: "Token User", email: "token@example.com" });
    const res = await rssGET(
      makeRssRequest(`http://localhost/api/feed/rss?token=${SAMPLE_TOKEN}`)
    );
    expect(res.status).toBe(200);
    expect(mockFeedTokenFindUnique).toHaveBeenCalledWith({
      where: { token: SAMPLE_TOKEN },
      select: { userId: true },
    });
  });

  it("calls generateRssFeed with fetched posts and returns XML body", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await rssGET(makeRssRequest());
    expect(mockGenerateRssFeed).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "post-1" }),
        expect.objectContaining({ id: "post-2" }),
      ]),
      expect.any(String),
      expect.stringContaining("/api/feed/rss")
    );
    const body = await res.text();
    expect(body).toContain("mock rss feed");
  });

  it("returns empty feed when user has no published posts", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindMany.mockResolvedValue([]);
    mockGenerateRssFeed.mockReturnValue("<rss><channel></channel></rss>");
    const res = await rssGET(makeRssRequest());
    expect(res.status).toBe(200);
    expect(mockGenerateRssFeed).toHaveBeenCalledWith([], expect.any(String), expect.any(String));
  });
});

// ── /api/feed/atom ────────────────────────────────────────────────────────────

describe("GET /api/feed/atom", () => {
  it("returns 401 when not authenticated and no token provided", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await atomGET(makeAtomRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid ?token= query param", async () => {
    mockAuth.mockResolvedValue(null);
    mockFeedTokenFindUnique.mockResolvedValue(null);
    const res = await atomGET(makeAtomRequest("http://localhost/api/feed/atom?token=bad-token"));
    expect(res.status).toBe(401);
  });

  it("authenticates via session and returns Atom feed", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await atomGET(makeAtomRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/atom+xml");
  });

  it("authenticates via valid ?token= query param", async () => {
    mockAuth.mockResolvedValue(null);
    mockFeedTokenFindUnique.mockResolvedValue({ userId: MOCK_USER_ID });
    mockUserFindUnique.mockResolvedValue({ name: "Token User", email: "token@example.com" });
    const res = await atomGET(
      makeAtomRequest(`http://localhost/api/feed/atom?token=${SAMPLE_TOKEN}`)
    );
    expect(res.status).toBe(200);
  });

  it("calls generateAtomFeed and returns Atom XML", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await atomGET(makeAtomRequest());
    expect(mockGenerateAtomFeed).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "post-1" })]),
      expect.any(String),
      expect.stringContaining("/api/feed/atom")
    );
    const body = await res.text();
    expect(body).toContain("mock atom feed");
  });
});

// ── /api/feed/token GET ───────────────────────────────────────────────────────

describe("GET /api/feed/token", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await tokenGET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await tokenGET();
    expect(res.status).toBe(429);
  });

  it("upserts and returns the token", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockFeedTokenUpsert.mockResolvedValue({ token: SAMPLE_TOKEN, createdAt: new Date() });
    const res = await tokenGET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe(SAMPLE_TOKEN);
    expect(mockFeedTokenUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID },
      })
    );
  });
});

// ── /api/feed/token DELETE ────────────────────────────────────────────────────

describe("DELETE /api/feed/token", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await tokenDELETE();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await tokenDELETE();
    expect(res.status).toBe(429);
  });

  it("revokes old token and returns a new one", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const newToken = "new-feed-token-xyz";
    mockFeedTokenDeleteMany.mockResolvedValue({ count: 1 });
    mockFeedTokenCreate.mockResolvedValue({ token: newToken, createdAt: new Date() });
    const res = await tokenDELETE();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe(newToken);
    expect(mockFeedTokenDeleteMany).toHaveBeenCalledWith({ where: { userId: MOCK_USER_ID } });
    expect(mockFeedTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: MOCK_USER_ID }) })
    );
  });
});
