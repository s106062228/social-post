jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
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
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    apiKey: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as zapPosts } from "@/app/api/zap/posts/route";
import { GET as zapPublished } from "@/app/api/zap/published/route";
import { prisma } from "@/lib/db";

const mockApiKeyFindUnique = prisma.apiKey.findUnique as jest.Mock;
const mockApiKeyUpdate = prisma.apiKey.update as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;

const USER_ID = "cluser0001";
const RAW_KEY = "pf_validapikey123456789012345678901234567890";
const KEY_HASH = require("crypto")
  .createHash("sha256")
  .update(RAW_KEY)
  .digest("hex");

const VALID_API_KEY_RECORD = {
  id: "clapikey001",
  userId: USER_ID,
  expiresAt: null,
};

const EXPIRED_API_KEY_RECORD = {
  id: "clapikey002",
  userId: USER_ID,
  expiresAt: new Date(Date.now() - 1000), // expired
};

const SAMPLE_POST = {
  id: "clpost001",
  content: "Hello world! #test",
  mediaType: "NONE",
  mediaUrls: [],
  status: "PUBLISHED",
  scheduledAt: null,
  language: "en",
  sentiment: "POSITIVE",
  sentimentScore: 0.9,
  starred: false,
  isEvergreen: false,
  createdAt: new Date("2024-01-01T10:00:00.000Z"),
  updatedAt: new Date("2024-01-01T10:05:00.000Z"),
  tags: [{ tag: { id: "cltag001", name: "test", color: "#3b82f6" } }],
  publishResults: [
    {
      platform: "FACEBOOK",
      status: "PUBLISHED",
      platformPostId: "fb123",
      publishedUrl: "https://facebook.com/post/123",
      publishedAt: new Date("2024-01-01T10:01:00.000Z"),
    },
  ],
};

function makeRequest(url: string, apiKey?: string): NextRequest {
  return new NextRequest(url, {
    method: "GET",
    headers: apiKey ? { "x-api-key": apiKey } : {},
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockApiKeyUpdate.mockResolvedValue({});
});

// ── /api/zap/posts ────────────────────────────────────────────────────────────

describe("GET /api/zap/posts", () => {
  it("returns 401 when x-api-key header is missing", async () => {
    const res = await zapPosts(makeRequest("http://localhost/api/zap/posts"));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/missing/i);
  });

  it("returns 401 when API key is invalid", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(null);

    const res = await zapPosts(
      makeRequest("http://localhost/api/zap/posts", "pf_badkey")
    );
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/invalid/i);
  });

  it("returns 401 when API key is expired", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(EXPIRED_API_KEY_RECORD);

    const res = await zapPosts(
      makeRequest("http://localhost/api/zap/posts", RAW_KEY)
    );
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/expired/i);
  });

  it("returns 200 with posts on valid API key", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(VALID_API_KEY_RECORD);
    mockPostFindMany.mockResolvedValueOnce([SAMPLE_POST]);

    const res = await zapPosts(
      makeRequest("http://localhost/api/zap/posts", RAW_KEY)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { posts: unknown[] };
    expect(Array.isArray(data.posts)).toBe(true);
    expect(data.posts).toHaveLength(1);
  });

  it("returns posts with the expected flat shape", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(VALID_API_KEY_RECORD);
    mockPostFindMany.mockResolvedValueOnce([SAMPLE_POST]);

    const res = await zapPosts(
      makeRequest("http://localhost/api/zap/posts", RAW_KEY)
    );
    const data = (await res.json()) as {
      posts: Array<{
        id: string;
        content: string;
        status: string;
        tags: unknown[];
        platforms: unknown[];
        createdAt: string;
      }>;
    };
    const post = data.posts[0];
    expect(post.id).toBe("clpost001");
    expect(post.content).toBe("Hello world! #test");
    expect(post.status).toBe("PUBLISHED");
    expect(Array.isArray(post.tags)).toBe(true);
    expect(Array.isArray(post.platforms)).toBe(true);
    expect(typeof post.createdAt).toBe("string");
  });

  it("passes the since filter to the query", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(VALID_API_KEY_RECORD);
    mockPostFindMany.mockResolvedValueOnce([]);

    const since = "2024-01-01T00:00:00.000Z";
    const res = await zapPosts(
      makeRequest(`http://localhost/api/zap/posts?since=${since}`, RAW_KEY)
    );
    expect(res.status).toBe(200);
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gt: new Date(since) },
        }),
      })
    );
  });

  it("returns empty posts array when no posts exist", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(VALID_API_KEY_RECORD);
    mockPostFindMany.mockResolvedValueOnce([]);

    const res = await zapPosts(
      makeRequest("http://localhost/api/zap/posts", RAW_KEY)
    );
    const data = (await res.json()) as { posts: unknown[] };
    expect(data.posts).toHaveLength(0);
  });
});

// ── /api/zap/published ────────────────────────────────────────────────────────

describe("GET /api/zap/published", () => {
  it("returns 401 when x-api-key header is missing", async () => {
    const res = await zapPublished(
      makeRequest("http://localhost/api/zap/published")
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when API key is invalid", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(null);

    const res = await zapPublished(
      makeRequest("http://localhost/api/zap/published", "pf_bad")
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 with published posts on valid API key", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(VALID_API_KEY_RECORD);
    mockPostFindMany.mockResolvedValueOnce([SAMPLE_POST]);

    const res = await zapPublished(
      makeRequest("http://localhost/api/zap/published", RAW_KEY)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { posts: unknown[] };
    expect(data.posts).toHaveLength(1);
  });

  it("filters by PUBLISHED status", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(VALID_API_KEY_RECORD);
    mockPostFindMany.mockResolvedValueOnce([]);

    await zapPublished(
      makeRequest("http://localhost/api/zap/published", RAW_KEY)
    );
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PUBLISHED" }),
      })
    );
  });

  it("passes the since filter to the query", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(VALID_API_KEY_RECORD);
    mockPostFindMany.mockResolvedValueOnce([]);

    const since = "2024-06-01T00:00:00.000Z";
    await zapPublished(
      makeRequest(`http://localhost/api/zap/published?since=${since}`, RAW_KEY)
    );
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publishResults: expect.objectContaining({
            some: expect.objectContaining({
              publishedAt: { gt: new Date(since) },
            }),
          }),
        }),
      })
    );
  });

  it("includes platform publish details in response", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(VALID_API_KEY_RECORD);
    mockPostFindMany.mockResolvedValueOnce([SAMPLE_POST]);

    const res = await zapPublished(
      makeRequest("http://localhost/api/zap/published", RAW_KEY)
    );
    const data = (await res.json()) as {
      posts: Array<{
        platforms: Array<{
          platform: string;
          platformPostId: string;
          publishedUrl: string;
          publishedAt: string;
        }>;
      }>;
    };
    const platforms = data.posts[0].platforms;
    expect(platforms).toHaveLength(1);
    expect(platforms[0].platform).toBe("FACEBOOK");
    expect(platforms[0].platformPostId).toBe("fb123");
  });
});
