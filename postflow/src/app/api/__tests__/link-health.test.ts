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

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findUnique: jest.fn(),
    },
    linkHealthCheck: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/posts/[id]/link-health/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockFindUniquePost = prisma.post.findUnique as jest.Mock;
const mockFindManyChecks = prisma.linkHealthCheck.findMany as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const MOCK_CHECKS = [
  {
    id: "clh3ck8zp0010qr5hyvxckahk",
    url: "https://good.example.com",
    statusCode: 200,
    isHealthy: true,
    errorMessage: null,
    checkedAt: new Date("2026-06-01T00:00:00Z"),
  },
  {
    id: "clh3ck8zp0011qr5hyvxckahk",
    url: "https://bad.example.com",
    statusCode: 404,
    isHealthy: false,
    errorMessage: "HTTP 404",
    checkedAt: new Date("2026-06-01T00:00:00Z"),
  },
];

function makeRequest(postId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/link-health`, {
    method: "GET",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
});

describe("GET /api/posts/[id]/link-health", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid (non-CUID) post ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await GET(makeRequest("not-a-cuid"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniquePost.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniquePost.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: OTHER_USER_ID });
    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns the link health summary shape for an owned post", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniquePost.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: MOCK_USER_ID });
    mockFindManyChecks.mockResolvedValueOnce(MOCK_CHECKS);

    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      checks: typeof MOCK_CHECKS;
      total: number;
      healthy: number;
      broken: number;
      lastCheckedAt: string | null;
    };
    expect(data.total).toBe(2);
    expect(data.healthy).toBe(1);
    expect(data.broken).toBe(1);
    expect(data.checks).toHaveLength(2);
    expect(data.lastCheckedAt).not.toBeNull();
  });

  it("returns zeroed summary and null lastCheckedAt when there are no checks", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniquePost.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: MOCK_USER_ID });
    mockFindManyChecks.mockResolvedValueOnce([]);

    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      checks: unknown[];
      total: number;
      healthy: number;
      broken: number;
      lastCheckedAt: string | null;
    };
    expect(data.total).toBe(0);
    expect(data.healthy).toBe(0);
    expect(data.broken).toBe(0);
    expect(data.checks).toEqual([]);
    expect(data.lastCheckedAt).toBeNull();
  });

  it("queries checks ordered by checkedAt desc scoped to the post", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniquePost.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: MOCK_USER_ID });
    mockFindManyChecks.mockResolvedValueOnce(MOCK_CHECKS);

    await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });

    expect(mockFindManyChecks).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId: MOCK_POST_ID },
        orderBy: { checkedAt: "desc" },
      })
    );
  });

  it("returns 500 on unexpected error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniquePost.mockRejectedValueOnce(new Error("DB error"));
    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(500);
  });
});
