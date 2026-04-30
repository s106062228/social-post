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

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findMany: jest.fn() },
    template: { findMany: jest.fn() },
    campaign: { findMany: jest.fn() },
    tag: { findMany: jest.fn() },
    hashtagGroup: { findMany: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { GET as searchHandler } from "@/app/api/search/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockTemplateFindMany = prisma.template.findMany as jest.Mock;
const mockCampaignFindMany = prisma.campaign.findMany as jest.Mock;
const mockTagFindMany = prisma.tag.findMany as jest.Mock;
const mockHashtagGroupFindMany = prisma.hashtagGroup.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeReq(q?: string): NextRequest {
  const url = q
    ? `http://localhost/api/search?q=${encodeURIComponent(q)}`
    : "http://localhost/api/search";
  return new NextRequest(url);
}

function emptyPrisma() {
  mockPostFindMany.mockResolvedValue([]);
  mockTemplateFindMany.mockResolvedValue([]);
  mockCampaignFindMany.mockResolvedValue([]);
  mockTagFindMany.mockResolvedValue([]);
  mockHashtagGroupFindMany.mockResolvedValue([]);
}

describe("GET /api/search", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await searchHandler(makeReq("hello"));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await searchHandler(makeReq("hello"));
    expect(res.status).toBe(429);
  });

  it("returns 400 when query is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await searchHandler(makeReq());
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/at least 2/i);
  });

  it("returns 400 when query is 1 character", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await searchHandler(makeReq("a"));
    expect(res.status).toBe(400);
  });

  it("returns empty results when nothing matches", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    emptyPrisma();
    const res = await searchHandler(makeReq("noresult"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      query: string;
      results: {
        posts: unknown[];
        templates: unknown[];
        campaigns: unknown[];
        tags: unknown[];
        hashtagGroups: unknown[];
      };
    };
    expect(data.query).toBe("noresult");
    expect(data.results.posts).toHaveLength(0);
    expect(data.results.templates).toHaveLength(0);
    expect(data.results.campaigns).toHaveLength(0);
    expect(data.results.tags).toHaveLength(0);
    expect(data.results.hashtagGroups).toHaveLength(0);
  });

  it("returns post results with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const fakePost = {
      id: "post1",
      content: "Hello world launch campaign",
      status: "DRAFT",
      scheduledAt: null,
    };
    mockPostFindMany.mockResolvedValue([fakePost]);
    mockTemplateFindMany.mockResolvedValue([]);
    mockCampaignFindMany.mockResolvedValue([]);
    mockTagFindMany.mockResolvedValue([]);
    mockHashtagGroupFindMany.mockResolvedValue([]);

    const res = await searchHandler(makeReq("launch"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      results: { posts: Array<{ type: string; id: string; label: string; href: string }> };
    };
    expect(data.results.posts).toHaveLength(1);
    const post = data.results.posts[0];
    expect(post.type).toBe("post");
    expect(post.id).toBe("post1");
    expect(post.label).toBe("Hello world launch campaign");
    expect(post.href).toContain("post1");
  });

  it("truncates post content label to 80 chars", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const longContent = "a".repeat(100);
    mockPostFindMany.mockResolvedValue([{ id: "p1", content: longContent, status: "DRAFT", scheduledAt: null }]);
    mockTemplateFindMany.mockResolvedValue([]);
    mockCampaignFindMany.mockResolvedValue([]);
    mockTagFindMany.mockResolvedValue([]);
    mockHashtagGroupFindMany.mockResolvedValue([]);

    const res = await searchHandler(makeReq("aaa"));
    const data = (await res.json()) as { results: { posts: Array<{ label: string }> } };
    expect(data.results.posts[0].label).toHaveLength(81); // 80 chars + "…"
    expect(data.results.posts[0].label.endsWith("…")).toBe(true);
  });

  it("returns template results with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValue([]);
    mockTemplateFindMany.mockResolvedValue([{ id: "t1", name: "Weekly Update", content: "Check our weekly update" }]);
    mockCampaignFindMany.mockResolvedValue([]);
    mockTagFindMany.mockResolvedValue([]);
    mockHashtagGroupFindMany.mockResolvedValue([]);

    const res = await searchHandler(makeReq("weekly"));
    const data = (await res.json()) as { results: { templates: Array<{ type: string; label: string }> } };
    expect(data.results.templates[0].type).toBe("template");
    expect(data.results.templates[0].label).toBe("Weekly Update");
  });

  it("returns campaign results with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValue([]);
    mockTemplateFindMany.mockResolvedValue([]);
    mockCampaignFindMany.mockResolvedValue([{ id: "c1", name: "Spring Sale", description: "Spring promo", isActive: true }]);
    mockTagFindMany.mockResolvedValue([]);
    mockHashtagGroupFindMany.mockResolvedValue([]);

    const res = await searchHandler(makeReq("spring"));
    const data = (await res.json()) as { results: { campaigns: Array<{ type: string; label: string; href: string }> } };
    expect(data.results.campaigns[0].type).toBe("campaign");
    expect(data.results.campaigns[0].label).toBe("Spring Sale");
    expect(data.results.campaigns[0].href).toContain("c1");
  });

  it("returns tag results with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    emptyPrisma();
    mockTagFindMany.mockResolvedValue([{ id: "tag1", name: "marketing", color: "#ff0000" }]);

    const res = await searchHandler(makeReq("market"));
    const data = (await res.json()) as { results: { tags: Array<{ type: string; label: string; color: string }> } };
    expect(data.results.tags[0].type).toBe("tag");
    expect(data.results.tags[0].label).toBe("marketing");
    expect(data.results.tags[0].color).toBe("#ff0000");
  });

  it("returns mixed results across categories", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValue([{ id: "p1", content: "social media strategy", status: "DRAFT", scheduledAt: null }]);
    mockTemplateFindMany.mockResolvedValue([{ id: "t1", name: "social template", content: "social content" }]);
    mockCampaignFindMany.mockResolvedValue([]);
    mockTagFindMany.mockResolvedValue([{ id: "tag1", name: "social", color: "#333" }]);
    mockHashtagGroupFindMany.mockResolvedValue([]);

    const res = await searchHandler(makeReq("social"));
    const data = (await res.json()) as {
      results: { posts: unknown[]; templates: unknown[]; tags: unknown[] };
    };
    expect(data.results.posts).toHaveLength(1);
    expect(data.results.templates).toHaveLength(1);
    expect(data.results.tags).toHaveLength(1);
  });
});
