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

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/check-duplicates/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/posts/check-duplicates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
  mockAuth.mockResolvedValue(AUTHED_SESSION);
});

describe("POST /api/posts/check-duplicates", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ content: "hello world content" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false });
    const res = await POST(makeRequest({ content: "hello world content" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for missing content", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty content", async () => {
    const res = await POST(makeRequest({ content: "" }));
    expect(res.status).toBe(400);
  });

  it("returns empty duplicates when no candidates match threshold", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "post1",
        content: "completely different unique post about flowers",
        status: "PUBLISHED",
        createdAt: new Date("2024-01-01"),
      },
    ]);

    const res = await POST(makeRequest({ content: "technology innovation machine learning" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { duplicates: unknown[] };
    expect(data.duplicates).toHaveLength(0);
  });

  it("returns matches above similarity threshold sorted by score desc", async () => {
    const highSimilarContent = "exciting summer sale starting this weekend amazing deals";
    const mediumSimilarContent = "exciting sale this weekend with deals available";
    const differentContent = "winter snow mountains hiking adventure travel";

    mockFindMany.mockResolvedValue([
      { id: "post-diff", content: differentContent, status: "PUBLISHED", createdAt: new Date("2024-01-01") },
      { id: "post-medium", content: mediumSimilarContent, status: "DRAFT", createdAt: new Date("2024-01-02") },
      { id: "post-high", content: highSimilarContent, status: "PUBLISHED", createdAt: new Date("2024-01-03") },
    ]);

    const res = await POST(
      makeRequest({ content: "exciting summer sale starting this weekend amazing deals" })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { duplicates: { id: string; score: number }[] };
    expect(data.duplicates.length).toBeGreaterThan(0);
    // Results should be sorted by score descending
    for (let i = 1; i < data.duplicates.length; i++) {
      expect(data.duplicates[i - 1].score).toBeGreaterThanOrEqual(data.duplicates[i].score);
    }
  });

  it("includes contentPreview, status, createdAt, and score in each result", async () => {
    const similarContent = "exciting summer sale starting this weekend amazing deals";
    mockFindMany.mockResolvedValue([
      { id: "post1", content: similarContent, status: "PUBLISHED", createdAt: new Date("2024-03-15") },
    ]);

    const res = await POST(
      makeRequest({ content: "exciting summer sale starting this weekend amazing deals" })
    );
    const data = (await res.json()) as {
      duplicates: { id: string; contentPreview: string; status: string; createdAt: string; score: number }[];
    };

    if (data.duplicates.length > 0) {
      const dup = data.duplicates[0];
      expect(dup).toHaveProperty("id");
      expect(dup).toHaveProperty("contentPreview");
      expect(dup).toHaveProperty("status");
      expect(dup).toHaveProperty("createdAt");
      expect(dup.score).toBeGreaterThanOrEqual(0);
      expect(dup.score).toBeLessThanOrEqual(100);
    }
  });

  it("passes excludeId to prisma query when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    const excludeId = "clh3ck8zp0001qr5hyvxckahk";

    await POST(makeRequest({ content: "some post content here", excludeId }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: excludeId },
        }),
      })
    );
  });

  it("does not include excludeId filter when not provided", async () => {
    mockFindMany.mockResolvedValue([]);

    await POST(makeRequest({ content: "some post content here" }));

    const callArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArgs.where).not.toHaveProperty("id");
  });
});
