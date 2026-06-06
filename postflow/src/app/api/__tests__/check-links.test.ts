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
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
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

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

const mockUpsert = jest.fn();
const mockTransaction = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findUnique: jest.fn(),
    },
    linkHealthCheck: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

jest.mock("@/lib/link-health", () => ({
  extractUrls: jest.fn(),
  checkUrlsHealth: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/[id]/check-links/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { extractUrls, checkUrlsHealth } from "@/lib/link-health";

const mockAuth = auth as jest.Mock;
const mockFindUniquePost = prisma.post.findUnique as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockExtractUrls = extractUrls as jest.Mock;
const mockCheckUrlsHealth = checkUrlsHealth as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const MOCK_RESULTS = [
  { url: "https://good.example.com", statusCode: 200, isHealthy: true, errorMessage: null },
  { url: "https://bad.example.com", statusCode: 404, isHealthy: false, errorMessage: "HTTP 404" },
];

function makeRequest(postId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/check-links`, {
    method: "POST",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
  mockTransaction.mockImplementation(async (arr: unknown[]) => arr);
  mockUpsert.mockResolvedValue({});
});

describe("POST /api/posts/[id]/check-links", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid (non-CUID) post ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest("not-a-cuid"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniquePost.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniquePost.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: OTHER_USER_ID,
      content: "Check https://example.com",
    });
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns a zeroed result without checking when the post has no links", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniquePost.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Just plain text with no links here",
    });
    mockExtractUrls.mockReturnValueOnce([]);

    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      checked: number;
      healthy: number;
      broken: number;
      results: unknown[];
    };
    expect(data).toEqual({ checked: 0, healthy: 0, broken: 0, results: [] });
    expect(mockExtractUrls).toHaveBeenCalledWith("Just plain text with no links here");
    expect(mockCheckUrlsHealth).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("checks extracted links, persists results, and returns the summary shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniquePost.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Check https://good.example.com and https://bad.example.com",
    });
    mockExtractUrls.mockReturnValueOnce(["https://good.example.com", "https://bad.example.com"]);
    mockCheckUrlsHealth.mockResolvedValueOnce(MOCK_RESULTS);

    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      checked: number;
      healthy: number;
      broken: number;
      results: typeof MOCK_RESULTS;
    };
    expect(data.checked).toBe(2);
    expect(data.healthy).toBe(1);
    expect(data.broken).toBe(1);
    expect(data.results).toEqual(MOCK_RESULTS);

    expect(mockCheckUrlsHealth).toHaveBeenCalledWith([
      "https://good.example.com",
      "https://bad.example.com",
    ]);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId_url: { postId: MOCK_POST_ID, url: "https://good.example.com" } },
        create: expect.objectContaining({
          postId: MOCK_POST_ID,
          userId: MOCK_USER_ID,
          url: "https://good.example.com",
        }),
      })
    );
  });

  it("returns 500 on unexpected error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniquePost.mockRejectedValueOnce(new Error("DB error"));
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(500);
  });
});
