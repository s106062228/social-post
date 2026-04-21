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
      deleteMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { DELETE } from "@/app/api/posts/bulk/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockPostDeleteMany = prisma.post.deleteMany as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const VALID_ID_1 = "clh3ck8zp0001qr5hyvxckahk";
const VALID_ID_2 = "clh3ck8zp0002qr5hyvxckahk";
const VALID_ID_3 = "clh3ck8zp0003qr5hyvxckahk";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/posts/bulk", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/posts/bulk", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await DELETE(makeRequest({ ids: [VALID_ID_1] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });

    const res = await DELETE(makeRequest({ ids: [VALID_ID_1] }));
    expect(res.status).toBe(429);
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const req = new NextRequest("http://localhost:3000/api/posts/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 when ids is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await DELETE(makeRequest({}));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when ids array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await DELETE(makeRequest({ ids: [] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when ids contains non-CUID strings", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await DELETE(makeRequest({ ids: ["not-a-cuid", "also-not"] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when ids array exceeds 100 items", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const ids = Array.from({ length: 101 }, (_, i) =>
      `clh3ck8zp${String(i).padStart(4, "0")}qr5hyvxckahk`
    );
    const res = await DELETE(makeRequest({ ids }));
    expect(res.status).toBe(400);
  });

  // ── Successful deletion ───────────────────────────────────────────────────

  it("returns 200 with deleted count on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostDeleteMany.mockResolvedValueOnce({ count: 2 });

    const res = await DELETE(makeRequest({ ids: [VALID_ID_1, VALID_ID_2] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { deleted: number };
    expect(data.deleted).toBe(2);
  });

  it("calls deleteMany with correct ownership and status filters", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostDeleteMany.mockResolvedValueOnce({ count: 3 });

    await DELETE(makeRequest({ ids: [VALID_ID_1, VALID_ID_2, VALID_ID_3] }));

    expect(mockPostDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: [VALID_ID_1, VALID_ID_2, VALID_ID_3] },
        userId: MOCK_USER_ID,
        status: { not: "PUBLISHING" },
      },
    });
  });

  it("returns 0 deleted when no posts match (all belong to another user)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostDeleteMany.mockResolvedValueOnce({ count: 0 });

    const res = await DELETE(makeRequest({ ids: [VALID_ID_1] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { deleted: number };
    expect(data.deleted).toBe(0);
  });

  it("accepts a single id in the array", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostDeleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await DELETE(makeRequest({ ids: [VALID_ID_1] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { deleted: number };
    expect(data.deleted).toBe(1);
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostDeleteMany.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await DELETE(makeRequest({ ids: [VALID_ID_1] }));
    expect(res.status).toBe(500);
  });
});
