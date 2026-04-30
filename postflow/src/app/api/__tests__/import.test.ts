jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
  },
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
  ImportStatus: {
    PENDING: "PENDING",
    COMPLETED: "COMPLETED",
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
    importBatch: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    post: {
      createMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/activity-log", () => ({
  logActivity: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/posts/import/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockBatchCreate = prisma.importBatch.create as jest.Mock;
const mockBatchFindMany = prisma.importBatch.findMany as jest.Mock;
const mockPostCreateMany = prisma.post.createMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

function makeFormRequest(csvContent: string, filename = "posts.csv"): NextRequest {
  const file = new File([csvContent], filename, { type: "text/csv" });
  const form = new FormData();
  form.append("file", file);

  return new NextRequest("http://localhost:3000/api/posts/import", {
    method: "POST",
    body: form,
  });
}

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/posts/import", {
    method: "GET",
  });
}

const SIMPLE_CSV = `content,scheduledAt,platforms
Hello world,,FACEBOOK
Second post,,INSTAGRAM`;

const SCHEDULED_CSV = `content,scheduledAt,platforms
Scheduled post,2030-01-01T10:00:00Z,FACEBOOK|INSTAGRAM`;

const INVALID_ROWS_CSV = `content,scheduledAt,platforms
,2026-01-01T10:00:00Z,FACEBOOK
Good post,,THREADS
Bad date,not-a-date,FACEBOOK`;

describe("GET /api/posts/import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it("returns list of import batches", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const mockBatches = [
      { id: "b1", filename: "posts.csv", totalRows: 5, successRows: 5, failedRows: 0, errors: [], status: "COMPLETED", createdAt: new Date() },
    ];
    mockBatchFindMany.mockResolvedValueOnce(mockBatches);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json() as { batches: unknown[] };
    expect(data.batches).toHaveLength(1);
  });
});

describe("POST /api/posts/import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
    mockPostCreateMany.mockResolvedValue({ count: 0 });
    mockBatchCreate.mockResolvedValue({
      id: "batch-1",
      filename: "posts.csv",
      totalRows: 2,
      successRows: 2,
      failedRows: 0,
      errors: [],
      status: "COMPLETED",
    });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeFormRequest(SIMPLE_CSV));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await POST(makeFormRequest(SIMPLE_CSV));
    expect(res.status).toBe(429);
  });

  // ── Content-Type validation ───────────────────────────────────────────────

  it("returns 415 for non-multipart requests", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const req = new NextRequest("http://localhost:3000/api/posts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });

  // ── File validation ───────────────────────────────────────────────────────

  it("returns 400 when no file is uploaded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const form = new FormData();
    const req = new NextRequest("http://localhost:3000/api/posts/import", {
      method: "POST",
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("No file");
  });

  it("returns 400 for non-CSV file", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeFormRequest(SIMPLE_CSV, "posts.txt"));
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toContain(".csv");
  });

  it("returns 400 when CSV has no content column", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const csv = `text,platforms\nHello,FACEBOOK`;
    const res = await POST(makeFormRequest(csv));
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("content");
  });

  it("returns 400 when CSV has no data rows", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const csv = `content,platforms`;
    const res = await POST(makeFormRequest(csv));
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("no data rows");
  });

  // ── Max rows ──────────────────────────────────────────────────────────────

  it("returns 422 when CSV exceeds 100 rows", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const rows = Array.from({ length: 101 }, (_, i) => `Post number ${i + 1},,`);
    const csv = `content,scheduledAt,platforms\n${rows.join("\n")}`;
    const res = await POST(makeFormRequest(csv));
    expect(res.status).toBe(422);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("100");
  });

  // ── Successful import ─────────────────────────────────────────────────────

  it("imports all valid rows and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostCreateMany.mockResolvedValueOnce({ count: 2 });

    const res = await POST(makeFormRequest(SIMPLE_CSV));
    expect(res.status).toBe(201);
    const data = await res.json() as {
      totalRows: number;
      successRows: number;
      failedRows: number;
      errors: unknown[];
      status: string;
    };
    expect(data.totalRows).toBe(2);
    expect(data.successRows).toBe(2);
    expect(data.failedRows).toBe(0);
    expect(data.errors).toHaveLength(0);
    expect(data.status).toBe("COMPLETED");
    expect(mockPostCreateMany).toHaveBeenCalledTimes(1);
  });

  it("creates scheduled posts when scheduledAt is provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostCreateMany.mockResolvedValueOnce({ count: 1 });

    await POST(makeFormRequest(SCHEDULED_CSV));

    const callArg = mockPostCreateMany.mock.calls[0][0] as {
      data: Array<{ status: string; scheduledAt: Date | null }>;
    };
    expect(callArg.data[0].status).toBe("SCHEDULED");
    expect(callArg.data[0].scheduledAt).toBeInstanceOf(Date);
  });

  // ── Partial success ───────────────────────────────────────────────────────

  it("returns partial success with per-row errors", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostCreateMany.mockResolvedValueOnce({ count: 1 });
    mockBatchCreate.mockResolvedValueOnce({
      id: "batch-2",
      filename: "posts.csv",
      totalRows: 3,
      successRows: 1,
      failedRows: 2,
      errors: [
        { row: 2, errors: ["content: must not be empty after sanitization"] },
        { row: 4, errors: ["scheduledAt: invalid date format"] },
      ],
      status: "COMPLETED",
    });

    const res = await POST(makeFormRequest(INVALID_ROWS_CSV));
    expect(res.status).toBe(201);
    const data = await res.json() as {
      totalRows: number;
      successRows: number;
      failedRows: number;
      errors: Array<{ row: number; errors: string[] }>;
    };
    expect(data.totalRows).toBe(3);
    expect(data.failedRows).toBeGreaterThan(0);
    expect(data.errors.length).toBeGreaterThan(0);
    // Each error entry has row number and messages
    data.errors.forEach((e) => {
      expect(typeof e.row).toBe("number");
      expect(Array.isArray(e.errors)).toBe(true);
    });
  });

  it("records the import batch in the database", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostCreateMany.mockResolvedValueOnce({ count: 2 });

    await POST(makeFormRequest(SIMPLE_CSV));

    expect(mockBatchCreate).toHaveBeenCalledTimes(1);
    const batchData = mockBatchCreate.mock.calls[0][0] as {
      data: {
        userId: string;
        filename: string;
        totalRows: number;
        successRows: number;
        failedRows: number;
        status: string;
      };
    };
    expect(batchData.data.userId).toBe(MOCK_USER_ID);
    expect(batchData.data.filename).toBe("posts.csv");
    expect(batchData.data.totalRows).toBe(2);
    expect(batchData.data.successRows).toBe(2);
    expect(batchData.data.failedRows).toBe(0);
    expect(batchData.data.status).toBe("COMPLETED");
  });

  it("skips createMany and marks batch FAILED when all rows are invalid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockBatchCreate.mockResolvedValueOnce({
      id: "batch-3",
      filename: "bad.csv",
      totalRows: 1,
      successRows: 0,
      failedRows: 1,
      errors: [{ row: 2, errors: ["content: must not be empty after sanitization"] }],
      status: "FAILED",
    });

    const allInvalidCsv = `content,platforms\n ,FACEBOOK`;
    const res = await POST(makeFormRequest(allInvalidCsv, "bad.csv"));
    expect(res.status).toBe(201);
    expect(mockPostCreateMany).not.toHaveBeenCalled();
    const data = await res.json() as { successRows: number; failedRows: number };
    expect(data.successRows).toBe(0);
    expect(data.failedRows).toBe(1);
  });
});
