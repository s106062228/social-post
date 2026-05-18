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
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    savedAnalyticsView: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/analytics/saved-views/route";
import { DELETE } from "@/app/api/analytics/saved-views/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.savedAnalyticsView.findMany as jest.Mock;
const mockCount = prisma.savedAnalyticsView.count as jest.Mock;
const mockCreate = prisma.savedAnalyticsView.create as jest.Mock;
const mockFindUnique = prisma.savedAnalyticsView.findUnique as jest.Mock;
const mockDelete = prisma.savedAnalyticsView.delete as jest.Mock;

const MOCK_USER_ID = "user-test-123";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_VIEW = {
  id: "view-1",
  userId: MOCK_USER_ID,
  name: "My 30-day view",
  reportType: "DASHBOARD",
  config: { period: "30d" },
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// ── GET /api/analytics/saved-views ────────────────────────────────────────────

describe("GET /api/analytics/saved-views", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest() {
    return new NextRequest("http://localhost:3000/api/analytics/saved-views");
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns empty views list when none exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { views: unknown[] };
    expect(data.views).toEqual([]);
  });

  it("returns saved views list with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([MOCK_VIEW]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { views: typeof MOCK_VIEW[] };
    expect(data.views).toHaveLength(1);
    expect(data.views[0].name).toBe("My 30-day view");
    expect(data.views[0].reportType).toBe("DASHBOARD");
    expect(data.views[0].config).toEqual({ period: "30d" });
  });
});

// ── POST /api/analytics/saved-views ───────────────────────────────────────────

describe("POST /api/analytics/saved-views", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/analytics/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ name: "Test", reportType: "DASHBOARD", config: {} }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest({ name: "Test", reportType: "DASHBOARD", config: {} }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for missing name", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ reportType: "DASHBOARD", config: {} }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing reportType", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makeRequest({ name: "Test", config: {} }));
    expect(res.status).toBe(400);
  });

  it("returns 422 when max saved views reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(20);

    const res = await POST(
      makeRequest({ name: "New", reportType: "DASHBOARD", config: { period: "7d" } })
    );
    expect(res.status).toBe(422);
  });

  it("creates saved view and returns 201 with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(MOCK_VIEW);

    const res = await POST(
      makeRequest({ name: "My 30-day view", reportType: "DASHBOARD", config: { period: "30d" } })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { view: typeof MOCK_VIEW };
    expect(data.view.name).toBe("My 30-day view");
    expect(data.view.config).toEqual({ period: "30d" });
  });
});

// ── DELETE /api/analytics/saved-views/[id] ────────────────────────────────────

describe("DELETE /api/analytics/saved-views/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id: string) {
    return new NextRequest(`http://localhost:3000/api/analytics/saved-views/${id}`, {
      method: "DELETE",
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await DELETE(makeRequest("view-1"), { params: Promise.resolve({ id: "view-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when view does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await DELETE(makeRequest("nonexistent"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when view belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: "other-user-id" });

    const res = await DELETE(makeRequest("view-1"), { params: Promise.resolve({ id: "view-1" }) });
    expect(res.status).toBe(403);
  });

  it("deletes view and returns success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockDelete.mockResolvedValueOnce({});

    const res = await DELETE(makeRequest("view-1"), { params: Promise.resolve({ id: "view-1" }) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });
});
