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
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
    LINKEDIN: "LINKEDIN",
    PINTEREST: "PINTEREST",
    YOUTUBE: "YOUTUBE",
    TIKTOK: "TIKTOK",
    TWITTER: "TWITTER",
    BLUESKY: "BLUESKY",
    MASTODON: "MASTODON",
    TELEGRAM: "TELEGRAM",
    REDDIT: "REDDIT",
    NOSTR: "NOSTR",
    TUMBLR: "TUMBLR",
    WORDPRESS: "WORDPRESS",
    MEDIUM: "MEDIUM",
    GHOST: "GHOST",
    DEVTO: "DEVTO",
    GOOGLE_BUSINESS: "GOOGLE_BUSINESS",
    HASHNODE: "HASHNODE",
    BEEHIIV: "BEEHIIV",
    PIXELFED: "PIXELFED",
    VIMEO: "VIMEO",
  },
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    syndicationRule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  },
}));

// Mock character-limits so applyTransformations works in tests
jest.mock("@/lib/character-limits", () => ({
  PLATFORM_CHAR_LIMITS: {
    FACEBOOK: 63206,
    INSTAGRAM: 2200,
    THREADS: 500,
    TWITTER: 280,
    LINKEDIN: 3000,
    PINTEREST: 500,
    YOUTUBE: 5000,
    TIKTOK: 2200,
    BLUESKY: 300,
    MASTODON: 500,
    TELEGRAM: 4096,
    REDDIT: 40000,
    NOSTR: 4096,
    TUMBLR: 4096,
    WORDPRESS: 200000,
    MEDIUM: 100000,
    GHOST: 100000,
    DEVTO: 100000,
    GOOGLE_BUSINESS: 1500,
    HASHNODE: 40000,
    BEEHIIV: 50000,
    PIXELFED: 500,
    VIMEO: 5000,
  },
}));

import { NextRequest } from "next/server";
import { GET as listRules, POST as createRule } from "@/app/api/syndication-rules/route";
import { PATCH as updateRule, DELETE as deleteRule } from "@/app/api/syndication-rules/[id]/route";
import { POST as testRule } from "@/app/api/syndication-rules/[id]/test/route";
import { applyTransformations } from "@/lib/syndication";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.syndicationRule.findMany as jest.Mock;
const mockFindUnique = prisma.syndicationRule.findUnique as jest.Mock;
const mockCreate = prisma.syndicationRule.create as jest.Mock;
const mockUpdate = prisma.syndicationRule.update as jest.Mock;
const mockDelete = prisma.syndicationRule.delete as jest.Mock;
const mockCount = prisma.syndicationRule.count as jest.Mock;

const USER_ID = "user_cuid_111";
const OTHER_USER_ID = "user_cuid_999";
const RULE_ID = "rule_cuid_abc";

const AUTHED_SESSION = { user: { id: USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_RULE = {
  id: RULE_ID,
  userId: USER_ID,
  name: "Facebook to Twitter",
  sourcePlatform: "FACEBOOK",
  targetPlatforms: ["TWITTER"],
  transformations: { truncate: true, stripLinks: false },
  delayMinutes: 0,
  isActive: true,
  createdAt: new Date("2026-08-28T10:00:00Z"),
  updatedAt: new Date("2026-08-28T10:00:00Z"),
};

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "DELETE" });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
});

// ── applyTransformations utility tests ────────────────────────────────────────

describe("applyTransformations utility", () => {
  it("truncates content to platform character limit", () => {
    const longContent = "a".repeat(400);
    const result = applyTransformations(
      longContent,
      { truncate: true },
      "TWITTER" as import("@prisma/client").Platform
    );
    expect(result.length).toBeLessThanOrEqual(280);
    expect(result.endsWith("…")).toBe(true);
  });

  it("strips links from content", () => {
    const content = "Check out https://example.com and http://foo.bar for more info";
    const result = applyTransformations(
      content,
      { stripLinks: true },
      "FACEBOOK" as import("@prisma/client").Platform
    );
    expect(result).not.toContain("https://");
    expect(result).not.toContain("http://");
    expect(result).toContain("Check out");
    expect(result).toContain("for more info");
  });

  it("appends hashtags to content", () => {
    const content = "Hello world";
    const result = applyTransformations(
      content,
      { appendHashtags: "crosspost syndicated" },
      "INSTAGRAM" as import("@prisma/client").Platform
    );
    expect(result).toContain("Hello world");
    expect(result).toContain("#crosspost");
    expect(result).toContain("#syndicated");
  });

  it("adds customSuffix to content", () => {
    const content = "Main post content";
    const result = applyTransformations(
      content,
      { customSuffix: "Originally from Facebook" },
      "TWITTER" as import("@prisma/client").Platform
    );
    expect(result).toContain("Main post content");
    expect(result).toContain("Originally from Facebook");
  });

  it("handles all transformations combined", () => {
    const content = "Check https://example.com for details. This is a long post that needs trimming " + "x".repeat(300);
    const result = applyTransformations(
      content,
      {
        truncate: true,
        stripLinks: true,
        appendHashtags: "repost",
        customSuffix: "Via FB",
      },
      "TWITTER" as import("@prisma/client").Platform
    );
    expect(result).not.toContain("https://");
    expect(result.length).toBeLessThanOrEqual(280);
  });
});

// ── GET /api/syndication-rules ────────────────────────────────────────────────

describe("GET /api/syndication-rules", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listRules();
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listRules();
    expect(res.status).toBe(429);
  });

  it("returns empty list when no rules exist", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const res = await listRules();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { rules: unknown[] };
    expect(Array.isArray(data.rules)).toBe(true);
    expect(data.rules).toHaveLength(0);
  });

  it("returns list of syndication rules", async () => {
    mockFindMany.mockResolvedValueOnce([MOCK_RULE]);
    const res = await listRules();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { rules: typeof MOCK_RULE[] };
    expect(data.rules).toHaveLength(1);
    expect(data.rules[0].name).toBe("Facebook to Twitter");
    expect(data.rules[0].sourcePlatform).toBe("FACEBOOK");
    expect(data.rules[0].targetPlatforms).toEqual(["TWITTER"]);
  });
});

// ── POST /api/syndication-rules ───────────────────────────────────────────────

describe("POST /api/syndication-rules", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createRule(
      makePostRequest("http://localhost/api/syndication-rules", {
        name: "Test Rule",
        sourcePlatform: "FACEBOOK",
        targetPlatforms: ["TWITTER"],
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is invalid (missing name)", async () => {
    const res = await createRule(
      makePostRequest("http://localhost/api/syndication-rules", {
        sourcePlatform: "FACEBOOK",
        targetPlatforms: ["TWITTER"],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when max rule limit reached", async () => {
    mockCount.mockResolvedValueOnce(20);
    const res = await createRule(
      makePostRequest("http://localhost/api/syndication-rules", {
        name: "One More",
        sourcePlatform: "FACEBOOK",
        targetPlatforms: ["TWITTER"],
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Maximum/);
  });

  it("returns 400 when sourcePlatform is also in targetPlatforms", async () => {
    mockCount.mockResolvedValueOnce(0);
    const res = await createRule(
      makePostRequest("http://localhost/api/syndication-rules", {
        name: "Bad Rule",
        sourcePlatform: "FACEBOOK",
        targetPlatforms: ["FACEBOOK", "TWITTER"],
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Source platform cannot be a target/);
  });

  it("creates rule and returns 201", async () => {
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(MOCK_RULE);

    const res = await createRule(
      makePostRequest("http://localhost/api/syndication-rules", {
        name: "Facebook to Twitter",
        sourcePlatform: "FACEBOOK",
        targetPlatforms: ["TWITTER"],
        transformations: { truncate: true },
        delayMinutes: 0,
      })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { rule: typeof MOCK_RULE };
    expect(data.rule.name).toBe("Facebook to Twitter");
    expect(data.rule.sourcePlatform).toBe("FACEBOOK");
  });
});

// ── PATCH /api/syndication-rules/[id] ────────────────────────────────────────

describe("PATCH /api/syndication-rules/[id]", () => {
  it("updates the rule and returns 200", async () => {
    const updatedRule = { ...MOCK_RULE, name: "Updated Name", isActive: false };
    mockFindUnique.mockResolvedValueOnce(MOCK_RULE);
    mockUpdate.mockResolvedValueOnce(updatedRule);

    const res = await updateRule(
      makePatchRequest(`http://localhost/api/syndication-rules/${RULE_ID}`, {
        name: "Updated Name",
        isActive: false,
      }),
      makeParams(RULE_ID)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { rule: typeof updatedRule };
    expect(data.rule.name).toBe("Updated Name");
    expect(data.rule.isActive).toBe(false);
  });

  it("returns 403 when rule belongs to another user", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...MOCK_RULE, userId: OTHER_USER_ID });

    const res = await updateRule(
      makePatchRequest(`http://localhost/api/syndication-rules/${RULE_ID}`, {
        isActive: false,
      }),
      makeParams(RULE_ID)
    );
    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/syndication-rules/[id] ───────────────────────────────────────

describe("DELETE /api/syndication-rules/[id]", () => {
  it("deletes the rule and returns 204", async () => {
    mockFindUnique.mockResolvedValueOnce(MOCK_RULE);
    mockDelete.mockResolvedValueOnce(MOCK_RULE);

    const res = await deleteRule(
      makeDeleteRequest(`http://localhost/api/syndication-rules/${RULE_ID}`),
      makeParams(RULE_ID)
    );
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: RULE_ID } });
  });
});

// ── POST /api/syndication-rules/[id]/test ────────────────────────────────────

describe("POST /api/syndication-rules/[id]/test", () => {
  it("returns preview of transformed content for each target platform", async () => {
    const ruleWithTargets = {
      ...MOCK_RULE,
      sourcePlatform: "FACEBOOK",
      targetPlatforms: ["TWITTER", "THREADS"],
      transformations: { truncate: true, stripLinks: false },
    };
    mockFindUnique.mockResolvedValueOnce(ruleWithTargets);

    const content = "Hello world! This is a test post.";
    const res = await testRule(
      makePostRequest(`http://localhost/api/syndication-rules/${RULE_ID}/test`, {
        content,
      }),
      makeParams(RULE_ID)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      original: string;
      adapted: { platform: string; content: string }[];
    };
    expect(data.original).toBe(content);
    expect(data.adapted).toHaveLength(2);
    expect(data.adapted.map((a) => a.platform)).toContain("TWITTER");
    expect(data.adapted.map((a) => a.platform)).toContain("THREADS");
  });
});
