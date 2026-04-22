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
    post: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/posts/export/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const SAMPLE_POSTS = [
  {
    id: "post1",
    content: "Hello world",
    status: "PUBLISHED",
    mediaType: "NONE",
    scheduledAt: new Date("2026-04-21T10:00:00Z"),
    createdAt: new Date("2026-04-20T08:00:00Z"),
    publishResults: [
      { platform: "FACEBOOK" },
      { platform: "INSTAGRAM" },
    ],
  },
  {
    id: "post2",
    content: 'Content with "quotes"',
    status: "DRAFT",
    mediaType: "IMAGE",
    scheduledAt: null,
    createdAt: new Date("2026-04-19T09:00:00Z"),
    publishResults: [],
  },
];

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost:3000/api/posts/export");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/posts/export", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 400 for invalid status filter", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await GET(makeRequest({ status: "INVALID_STATUS" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid query parameters");
  });

  // ── Response headers ──────────────────────────────────────────────────────

  it("returns CSV content-type and Content-Disposition header", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValueOnce(SAMPLE_POSTS);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain("posts-export.csv");
  });

  it("sets Cache-Control: no-store", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  // ── CSV content ───────────────────────────────────────────────────────────

  it("returns CSV with header row", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    const csv = await res.text();
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toBe("id,content,status,mediaType,scheduledAt,createdAt,publishedPlatforms");
  });

  it("returns one data row per post", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValueOnce(SAMPLE_POSTS);

    const res = await GET(makeRequest());
    const csv = await res.text();
    const lines = csv.split("\n");
    // header + 2 data rows
    expect(lines).toHaveLength(3);
  });

  it("includes published platforms joined with pipe", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValueOnce([SAMPLE_POSTS[0]]);

    const res = await GET(makeRequest());
    const csv = await res.text();
    const dataRow = csv.split("\n")[1];
    expect(dataRow).toContain("FACEBOOK|INSTAGRAM");
  });

  it("escapes fields containing commas with double quotes", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValueOnce([
      {
        id: "post3",
        content: "Hello, world",
        status: "DRAFT",
        mediaType: "NONE",
        scheduledAt: null,
        createdAt: new Date("2026-04-19T09:00:00Z"),
        publishResults: [],
      },
    ]);

    const res = await GET(makeRequest());
    const csv = await res.text();
    const dataRow = csv.split("\n")[1];
    expect(dataRow).toContain('"Hello, world"');
  });

  it("escapes fields containing double quotes", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValueOnce([SAMPLE_POSTS[1]]);

    const res = await GET(makeRequest());
    const csv = await res.text();
    const dataRow = csv.split("\n")[1];
    // "quotes" → ""quotes""
    expect(dataRow).toContain('"Content with ""quotes"""');
  });

  it("leaves scheduledAt empty when null", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValueOnce([SAMPLE_POSTS[1]]); // scheduledAt is null

    const res = await GET(makeRequest());
    const csv = await res.text();
    const dataRow = csv.split("\n")[1];
    // scheduledAt column (index 4) should be empty
    const cols = dataRow.split(",");
    // account for quoted content field — parse more carefully
    expect(dataRow).toContain(",,"); // empty scheduledAt between mediaType and createdAt
  });

  it("passes status filter to Prisma query", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValueOnce([]);

    await GET(makeRequest({ status: "PUBLISHED" }));

    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PUBLISHED" }),
      })
    );
  });

  it("passes search filter to Prisma query", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockResolvedValueOnce([]);

    await GET(makeRequest({ search: "hello" }));

    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          content: { contains: "hello", mode: "insensitive" },
        }),
      })
    );
  });

  it("returns 500 on unexpected DB error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindMany.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Internal server error");
  });
});
