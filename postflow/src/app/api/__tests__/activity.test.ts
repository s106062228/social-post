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
    activityLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as getActivity } from "@/app/api/activity/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.activityLog.findMany as jest.Mock;
const mockCount = prisma.activityLog.count as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_LOG = {
  id: "log1",
  userId: MOCK_USER_ID,
  action: "post.created",
  entityId: "post1",
  entityType: "post",
  metadata: { status: "DRAFT" },
  createdAt: new Date("2026-04-21T10:00:00Z"),
};

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/activity");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

// ── GET /api/activity ─────────────────────────────────────────────────────────

describe("GET /api/activity", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getActivity(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await getActivity(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid page parameter", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await getActivity(makeRequest({ page: "0" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for limit exceeding 100", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await getActivity(makeRequest({ limit: "101" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with logs and pagination when authenticated", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_LOG]);
    mockCount.mockResolvedValueOnce(1);

    const res = await getActivity(makeRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      logs: typeof BASE_LOG[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };
    expect(data.logs).toHaveLength(1);
    expect(data.logs[0].action).toBe("post.created");
    expect(data.pagination.total).toBe(1);
    expect(data.pagination.totalPages).toBe(1);
  });

  it("returns empty logs array when no activity", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);

    const res = await getActivity(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { logs: unknown[]; pagination: { total: number } };
    expect(data.logs).toHaveLength(0);
    expect(data.pagination.total).toBe(0);
  });

  it("queries prisma with the session user id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);

    await getActivity(makeRequest());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: MOCK_USER_ID }) })
    );
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: MOCK_USER_ID }) })
    );
  });

  it("applies entityType filter when provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);

    await getActivity(makeRequest({ entityType: "post" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: MOCK_USER_ID, entityType: "post" }),
      })
    );
  });

  it("applies pagination with skip and take", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(50);

    await getActivity(makeRequest({ page: "3", limit: "10" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
  });

  it("calculates totalPages correctly", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(55);

    const res = await getActivity(makeRequest({ limit: "20" }));
    const data = (await res.json()) as { pagination: { totalPages: number } };
    expect(data.pagination.totalPages).toBe(3);
  });

  it("orders logs by createdAt descending", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);

    await getActivity(makeRequest());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB down"));

    const res = await getActivity(makeRequest());
    expect(res.status).toBe(500);
  });

  it("returns multiple logs in correct order", async () => {
    const logs = [
      { ...BASE_LOG, id: "log2", action: "post.deleted", createdAt: new Date("2026-04-21T11:00:00Z") },
      { ...BASE_LOG, id: "log1", action: "post.created", createdAt: new Date("2026-04-21T10:00:00Z") },
    ];
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce(logs);
    mockCount.mockResolvedValueOnce(2);

    const res = await getActivity(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { logs: { action: string }[] };
    expect(data.logs[0].action).toBe("post.deleted");
    expect(data.logs[1].action).toBe("post.created");
  });
});
