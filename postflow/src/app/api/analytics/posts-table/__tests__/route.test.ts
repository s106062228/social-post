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
  PublishStatus: {
    PUBLISHED: "PUBLISHED",
    FAILED: "FAILED",
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/db", () => ({
  prisma: {
    publishResult: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

jest.mock("@/lib/content-score", () => ({
  computeScore: jest.fn((ins) => ins.likes * 3 + ins.comments * 5 + ins.shares * 4),
}));

import { NextRequest } from "next/server";
import { GET } from "../route";
import { GET as GET_EXPORT } from "../export/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.publishResult.findMany as jest.Mock;

function makeReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/analytics/posts-table");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const sampleResult = {
  id: "pr1",
  postId: "post1",
  platform: "FACEBOOK",
  publishedAt: new Date("2024-01-15T10:00:00Z"),
  publishedUrl: "https://facebook.com/post/1",
  post: { content: "Test post content", mediaType: "NONE" },
  insights: {
    impressions: 1000,
    reach: 800,
    likes: 50,
    comments: 10,
    shares: 5,
  },
};

describe("GET /api/analytics/posts-table", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockLimiter.mockResolvedValue({ success: true });
    mockFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValue({ success: false });
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid sort param", async () => {
    const res = await GET(makeReq({ sort: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns empty rows when no results", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: unknown[]; total: number; totalPages: number };
    expect(body.rows).toHaveLength(0);
    expect(body.total).toBe(0);
    expect(body.totalPages).toBe(0);
  });

  it("returns rows with correct shape", async () => {
    mockFindMany.mockResolvedValue([sampleResult]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: Record<string, unknown>[] };
    expect(body.rows).toHaveLength(1);
    const row = body.rows[0];
    expect(row).toHaveProperty("postId");
    expect(row).toHaveProperty("content");
    expect(row).toHaveProperty("platform");
    expect(row).toHaveProperty("publishedAt");
    expect(row).toHaveProperty("impressions");
    expect(row).toHaveProperty("reach");
    expect(row).toHaveProperty("likes");
    expect(row).toHaveProperty("comments");
    expect(row).toHaveProperty("shares");
    expect(row).toHaveProperty("engagementScore");
  });

  it("truncates content to 80 chars", async () => {
    const longContent = "A".repeat(100);
    mockFindMany.mockResolvedValue([
      { ...sampleResult, post: { content: longContent, mediaType: "NONE" } },
    ]);
    const res = await GET(makeReq());
    const body = await res.json() as { rows: { content: string }[] };
    expect(body.rows[0].content.length).toBeLessThanOrEqual(81); // 80 + ellipsis
    expect(body.rows[0].content).toContain("…");
  });

  it("filters by platform", async () => {
    mockFindMany.mockResolvedValue([sampleResult]);
    const res = await GET(makeReq({ platform: "FACEBOOK" }));
    expect(res.status).toBe(200);
    // Verify platform filter was passed to prisma
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ platform: "FACEBOOK" }),
      })
    );
  });

  it("applies period filter", async () => {
    const res = await GET(makeReq({ period: "7d" }));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publishedAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      })
    );
  });

  it("does not apply date filter for 'all' period", async () => {
    const res = await GET(makeReq({ period: "all" }));
    expect(res.status).toBe(200);
    const call = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty("publishedAt");
  });

  it("paginates results correctly", async () => {
    // Create 60 results
    const results = Array.from({ length: 60 }, (_, i) => ({
      ...sampleResult,
      id: `pr${i}`,
      postId: `post${i}`,
    }));
    mockFindMany.mockResolvedValue(results);
    const res = await GET(makeReq({ page: "2", limit: "50" }));
    const body = await res.json() as { rows: unknown[]; total: number; totalPages: number; page: number };
    expect(body.total).toBe(60);
    expect(body.rows).toHaveLength(10); // page 2 of 50 = 10 remaining
    expect(body.page).toBe(2);
    expect(body.totalPages).toBe(2);
  });

  it("returns 500 on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });
});

describe("GET /api/analytics/posts-table/export", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockLimiter.mockResolvedValue({ success: true });
    mockFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET_EXPORT(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValue({ success: false });
    const res = await GET_EXPORT(makeReq());
    expect(res.status).toBe(429);
  });

  it("returns CSV content-type", async () => {
    const res = await GET_EXPORT(makeReq({ period: "30d" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
  });

  it("includes Content-Disposition header with filename", async () => {
    const res = await GET_EXPORT(makeReq({ period: "30d" }));
    const cd = res.headers.get("content-disposition");
    expect(cd).toBeTruthy();
    expect(cd).toContain("attachment");
    expect(cd).toContain("postflow-posts-");
    expect(cd).toContain("-30d.csv");
  });

  it("includes CSV header row", async () => {
    const res = await GET_EXPORT(makeReq());
    const text = await res.text();
    expect(text).toContain("post_id,content,platform,published_at");
  });

  it("includes data rows for published results", async () => {
    mockFindMany.mockResolvedValue([sampleResult]);
    const res = await GET_EXPORT(makeReq());
    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(2); // header + 1 data row
    expect(lines[1]).toContain("FACEBOOK");
  });

  it("escapes content with commas in CSV", async () => {
    mockFindMany.mockResolvedValue([
      {
        ...sampleResult,
        post: { content: "Hello, world", mediaType: "NONE" },
      },
    ]);
    const res = await GET_EXPORT(makeReq());
    const text = await res.text();
    expect(text).toContain('"Hello, world"');
  });
});
