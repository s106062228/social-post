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
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
    LINKEDIN: "LINKEDIN",
    TWITTER: "TWITTER",
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
    contentRule: { findMany: jest.fn() },
    brandKit: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/content-validator", () => ({
  validateForAllPlatforms: jest.fn(),
}));

jest.mock("@/lib/content-rules", () => ({
  checkContentRules: jest.fn(),
}));

jest.mock("@/lib/brand-compliance", () => ({
  checkBrandCompliance: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/bulk-validate/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { validateForAllPlatforms } from "@/lib/content-validator";
import { checkContentRules } from "@/lib/content-rules";
import { checkBrandCompliance } from "@/lib/brand-compliance";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockRuleFindMany = prisma.contentRule.findMany as jest.Mock;
const mockBrandKitFindUnique = prisma.brandKit.findUnique as jest.Mock;
const mockValidateForAllPlatforms = validateForAllPlatforms as jest.Mock;
const mockCheckContentRules = checkContentRules as jest.Mock;
const mockCheckBrandCompliance = checkBrandCompliance as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const POST_ID_1 = "clh3ck8zp0001qr5hyvxckahk";
const POST_ID_2 = "clh3ck8zp0002qr5hyvxckahk";

const PASSING_PLATFORM_RESULT = { platform: "FACEBOOK", valid: true, errors: [], warnings: [] };
const FAILING_PLATFORM_RESULT = {
  platform: "INSTAGRAM",
  valid: false,
  errors: ["Content too long"],
  warnings: [],
};

const RULES_PASS = { violations: [], errors: [], warnings: [], compliant: true };
const RULES_FAIL = {
  violations: [{ type: "FORBIDDEN_WORD", severity: "ERROR", message: "Contains forbidden word" }],
  errors: [{ type: "FORBIDDEN_WORD", severity: "ERROR", message: "Contains forbidden word" }],
  warnings: [],
  compliant: false,
};

const BRAND_PASS = { violations: [], compliant: true, score: 100 };
const BRAND_FAIL = {
  violations: [{ type: "forbidden", message: "Contains forbidden keyword" }],
  compliant: false,
  score: 50,
};

function makePost(id: string, content = "Hello world") {
  return {
    id,
    content,
    status: "DRAFT",
    mediaType: "NONE",
    mediaUrls: [],
    publishResults: [{ platform: "FACEBOOK" }],
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/posts/bulk-validate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/posts/bulk-validate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue({ success: true });
    mockPostFindMany.mockResolvedValue([makePost(POST_ID_1)]);
    mockRuleFindMany.mockResolvedValue([]);
    mockBrandKitFindUnique.mockResolvedValue(null);
    mockValidateForAllPlatforms.mockReturnValue([PASSING_PLATFORM_RESULT]);
    mockCheckContentRules.mockReturnValue(RULES_PASS);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/posts/bulk-validate", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty postIds array", async () => {
    const res = await POST(makeRequest({ postIds: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when postIds exceeds 50", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `clh3ck8zp${String(i).padStart(4, "0")}qr5hyvxckahk`);
    const res = await POST(makeRequest({ postIds: ids }));
    expect(res.status).toBe(400);
  });

  it("returns results for a single passing post", async () => {
    mockValidateForAllPlatforms.mockReturnValue([PASSING_PLATFORM_RESULT]);
    mockCheckContentRules.mockReturnValue(RULES_PASS);
    mockBrandKitFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      results: Array<{ postId: string; overallValid: boolean; errorCount: number }>;
      totalPosts: number;
      passingPosts: number;
      failingPosts: number;
    };

    expect(body.totalPosts).toBe(1);
    expect(body.passingPosts).toBe(1);
    expect(body.failingPosts).toBe(0);
    expect(body.results[0].postId).toBe(POST_ID_1);
    expect(body.results[0].overallValid).toBe(true);
    expect(body.results[0].errorCount).toBe(0);
  });

  it("marks post as failing when platform validation has errors", async () => {
    mockValidateForAllPlatforms.mockReturnValue([FAILING_PLATFORM_RESULT]);
    mockCheckContentRules.mockReturnValue(RULES_PASS);

    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      results: Array<{ overallValid: boolean; errorCount: number }>;
      failingPosts: number;
    };
    expect(body.failingPosts).toBe(1);
    expect(body.results[0].overallValid).toBe(false);
    expect(body.results[0].errorCount).toBe(1);
  });

  it("marks post as failing when content rules have errors", async () => {
    mockValidateForAllPlatforms.mockReturnValue([PASSING_PLATFORM_RESULT]);
    mockCheckContentRules.mockReturnValue(RULES_FAIL);

    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    const body = (await res.json()) as {
      results: Array<{ overallValid: boolean; contentRulesResult: { errors: number; compliant: boolean } }>;
      failingPosts: number;
    };
    expect(body.failingPosts).toBe(1);
    expect(body.results[0].overallValid).toBe(false);
    expect(body.results[0].contentRulesResult.errors).toBe(1);
    expect(body.results[0].contentRulesResult.compliant).toBe(false);
  });

  it("marks post as failing when brand compliance has violations", async () => {
    mockBrandKitFindUnique.mockResolvedValue({ doKeywords: ["brand"], dontKeywords: ["bad"] });
    mockCheckBrandCompliance.mockReturnValue(BRAND_FAIL);
    mockValidateForAllPlatforms.mockReturnValue([PASSING_PLATFORM_RESULT]);
    mockCheckContentRules.mockReturnValue(RULES_PASS);

    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    const body = (await res.json()) as {
      results: Array<{
        overallValid: boolean;
        errorCount: number;
        brandResult: { compliant: boolean; violations: unknown[] };
      }>;
      failingPosts: number;
    };
    expect(body.failingPosts).toBe(1);
    expect(body.results[0].overallValid).toBe(false);
    expect(body.results[0].errorCount).toBeGreaterThan(0);
    expect(body.results[0].brandResult?.compliant).toBe(false);
  });

  it("brandResult is null when no brand kit configured", async () => {
    mockBrandKitFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    const body = (await res.json()) as { results: Array<{ brandResult: null }> };
    expect(body.results[0].brandResult).toBeNull();
  });

  it("handles multiple posts with mixed results", async () => {
    mockPostFindMany.mockResolvedValue([makePost(POST_ID_1), makePost(POST_ID_2)]);
    mockValidateForAllPlatforms
      .mockReturnValueOnce([PASSING_PLATFORM_RESULT])
      .mockReturnValueOnce([FAILING_PLATFORM_RESULT]);
    mockCheckContentRules.mockReturnValue(RULES_PASS);

    const res = await POST(makeRequest({ postIds: [POST_ID_1, POST_ID_2] }));
    const body = (await res.json()) as {
      totalPosts: number;
      passingPosts: number;
      failingPosts: number;
    };
    expect(body.totalPosts).toBe(2);
    expect(body.passingPosts).toBe(1);
    expect(body.failingPosts).toBe(1);
  });

  it("only returns posts owned by the authenticated user", async () => {
    // Simulate DB returning only the owned post even though two IDs were sent
    mockPostFindMany.mockResolvedValue([makePost(POST_ID_1)]);

    const res = await POST(makeRequest({ postIds: [POST_ID_1, POST_ID_2] }));
    const body = (await res.json()) as { totalPosts: number };
    expect(body.totalPosts).toBe(1);
    // Ensure userId was used in the query
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: MOCK_USER_ID }),
      })
    );
  });

  it("content in result is capped at 100 chars", async () => {
    const longContent = "A".repeat(200);
    mockPostFindMany.mockResolvedValue([{ ...makePost(POST_ID_1), content: longContent }]);

    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    const body = (await res.json()) as { results: Array<{ content: string }> };
    expect(body.results[0].content.length).toBeLessThanOrEqual(100);
  });

  it("returns brandErrors equal to violations.length when brand kit fails", async () => {
    const multiViolationBrand = {
      violations: [
        { type: "forbidden", message: "Contains bad1" },
        { type: "forbidden", message: "Contains bad2" },
      ],
      compliant: false,
      score: 30,
    };
    mockBrandKitFindUnique.mockResolvedValue({ doKeywords: [], dontKeywords: ["bad1", "bad2"] });
    mockCheckBrandCompliance.mockReturnValue(multiViolationBrand);
    mockValidateForAllPlatforms.mockReturnValue([PASSING_PLATFORM_RESULT]);
    mockCheckContentRules.mockReturnValue(RULES_PASS);

    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    const body = (await res.json()) as { results: Array<{ errorCount: number }> };
    // brandErrors counts violations.length (2), not just 1
    expect(body.results[0].errorCount).toBe(2);
  });
});
