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

jest.mock("@/lib/activity-log", () => ({ logActivity: jest.fn() }));

const mockFindMany = jest.fn();
const mockUpdate = jest.fn();
const mockTransaction = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/posts/schedule-conflicts/route";
import { POST } from "@/app/api/posts/resolve-conflicts/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const BASE_TIME = new Date("2026-06-01T10:00:00Z");
function minAfter(n: number) {
  return new Date(BASE_TIME.getTime() + n * 60_000);
}

function makePost(id: string, offset: number, platforms: string[] = []) {
  return {
    id,
    scheduledAt: minAfter(offset),
    publishResults: platforms.map((p) => ({ platform: p })),
  };
}

// ── GET /api/posts/schedule-conflicts ────────────────────────────────────────

describe("GET /api/posts/schedule-conflicts", () => {
  function makeGetRequest(windowMinutes?: number): NextRequest {
    const url = `http://localhost:3000/api/posts/schedule-conflicts${windowMinutes !== undefined ? `?windowMinutes=${windowMinutes}` : ""}`;
    return new NextRequest(url, { method: "GET" });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
    mockFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
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

  it("returns empty conflicts when no SCHEDULED posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { conflicts: unknown[]; totalConflicts: number };
    expect(data.conflicts).toHaveLength(0);
    expect(data.totalConflicts).toBe(0);
  });

  it("detects conflicts when posts share platform and are within windowMinutes", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([
      makePost("p1", 0, ["FACEBOOK"]),
      makePost("p2", 15, ["FACEBOOK"]),
    ]);

    const res = await GET(makeGetRequest(30));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { conflicts: unknown[]; totalConflicts: number };
    expect(data.totalConflicts).toBe(1);
    expect(data.conflicts).toHaveLength(1);
  });

  it("returns correct conflict shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([
      makePost("p1", 0, ["INSTAGRAM"]),
      makePost("p2", 10, ["INSTAGRAM"]),
    ]);

    const res = await GET(makeGetRequest(30));
    const data = (await res.json()) as {
      conflicts: Array<{
        postAId: string;
        postBId: string;
        platform: string;
        postATime: string;
        postBTime: string;
        overlapMinutes: number;
      }>;
    };
    const c = data.conflicts[0];
    expect(c.postAId).toBeDefined();
    expect(c.postBId).toBeDefined();
    expect(c.platform).toBe("INSTAGRAM");
    expect(c.overlapMinutes).toBeGreaterThan(0);
  });

  it("respects windowMinutes query param", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    // Posts 45 min apart — no conflict with window=30
    mockFindMany.mockResolvedValueOnce([
      makePost("p1", 0, ["TWITTER"]),
      makePost("p2", 45, ["TWITTER"]),
    ]);

    const res = await GET(makeGetRequest(30));
    const data = (await res.json()) as { totalConflicts: number };
    expect(data.totalConflicts).toBe(0);
  });

  it("includes windowMinutes in response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest(60));
    const data = (await res.json()) as { windowMinutes: number };
    expect(data.windowMinutes).toBe(60);
  });
});

// ── POST /api/posts/resolve-conflicts ─────────────────────────────────────────

describe("POST /api/posts/resolve-conflicts", () => {
  function makePostRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost:3000/api/posts/resolve-conflicts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
    mockTransaction.mockImplementation(async (arr: unknown[]) => arr);
    mockUpdate.mockResolvedValue({});
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(429);
  });

  it("returns resolved: 0 when no conflicts exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    // Posts 60 min apart — no conflict with default window=30
    mockFindMany.mockResolvedValueOnce([
      makePost("p1", 0, ["FACEBOOK"]),
      makePost("p2", 60, ["FACEBOOK"]),
    ]);

    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { resolved: number; updates: unknown[] };
    expect(data.resolved).toBe(0);
    expect(data.updates).toHaveLength(0);
  });

  it("resolves conflicts and returns update records", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([
      makePost("p1", 0, ["FACEBOOK"]),
      makePost("p2", 5, ["FACEBOOK"]),
    ]);

    const res = await POST(makePostRequest({ windowMinutes: 30, spacingMinutes: 30 }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      resolved: number;
      updates: Array<{ postId: string; newScheduledAt: string }>;
    };
    expect(data.resolved).toBeGreaterThan(0);
    expect(data.updates.length).toBeGreaterThan(0);
    expect(data.updates[0].postId).toBeDefined();
    expect(data.updates[0].newScheduledAt).toBeDefined();
  });

  it("calls $transaction with post updates", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([
      makePost("p1", 0, ["TWITTER"]),
      makePost("p2", 10, ["TWITTER"]),
    ]);

    await POST(makePostRequest({}));
    expect(mockTransaction).toHaveBeenCalled();
  });
});
