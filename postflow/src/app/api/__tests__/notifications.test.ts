jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  workerLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
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
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as getNotifications } from "@/app/api/notifications/route";
import { POST as markRead } from "@/app/api/notifications/[id]/read/route";
import { POST as markAllRead } from "@/app/api/notifications/read-all/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.notification.findMany as jest.Mock;
const mockCount = prisma.notification.count as jest.Mock;
const mockFindUnique = prisma.notification.findUnique as jest.Mock;
const mockUpdate = prisma.notification.update as jest.Mock;
const mockUpdateMany = prisma.notification.updateMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0000qr5hyvxckahj";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_NOTIFICATION = {
  id: "notif1",
  userId: MOCK_USER_ID,
  type: "post.published",
  title: "Post published successfully",
  body: "Your post has been published to all selected platforms.",
  read: false,
  entityId: "post1",
  entityType: "post",
  createdAt: new Date("2026-04-22T10:00:00Z"),
};

function makeRequest(params: Record<string, string> = {}, url = "http://localhost:3000/api/notifications") {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new NextRequest(u.toString());
}

function makeParamsPromise(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

// ── GET /api/notifications ────────────────────────────────────────────────────

describe("GET /api/notifications", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getNotifications(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await getNotifications(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid page parameter", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await getNotifications(makeRequest({ page: "0" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with notifications and unreadCount", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_NOTIFICATION]);
    mockCount
      .mockResolvedValueOnce(1) // total
      .mockResolvedValueOnce(1); // unreadCount

    const res = await getNotifications(makeRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      notifications: typeof BASE_NOTIFICATION[];
      unreadCount: number;
      pagination: { total: number };
    };
    expect(data.notifications).toHaveLength(1);
    expect(data.notifications[0].type).toBe("post.published");
    expect(data.unreadCount).toBe(1);
    expect(data.pagination.total).toBe(1);
  });

  it("returns empty list when no notifications", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const res = await getNotifications(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { notifications: unknown[]; unreadCount: number };
    expect(data.notifications).toHaveLength(0);
    expect(data.unreadCount).toBe(0);
  });

  it("applies unreadOnly filter when requested", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await getNotifications(makeRequest({ unreadOnly: "true" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: MOCK_USER_ID, read: false }),
      })
    );
  });

  it("queries prisma with session user id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await getNotifications(makeRequest());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: MOCK_USER_ID }) })
    );
  });

  it("applies pagination with skip and take", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await getNotifications(makeRequest({ page: "3", limit: "5" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    );
  });

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB down"));

    const res = await getNotifications(makeRequest());
    expect(res.status).toBe(500);
  });
});

// ── POST /api/notifications/[id]/read ────────────────────────────────────────

describe("POST /api/notifications/[id]/read", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await markRead(makeRequest({}, "http://localhost/api/notifications/notif1/read"), {
      params: makeParamsPromise("notif1"),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await markRead(makeRequest({}, "http://localhost/api/notifications/notif1/read"), {
      params: makeParamsPromise("notif1"),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when notification does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await markRead(makeRequest({}, "http://localhost/api/notifications/notif1/read"), {
      params: makeParamsPromise("notif1"),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when notification belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    const res = await markRead(makeRequest({}, "http://localhost/api/notifications/notif1/read"), {
      params: makeParamsPromise("notif1"),
    });
    expect(res.status).toBe(403);
  });

  it("marks notification as read and returns updated notification", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockUpdate.mockResolvedValueOnce({ ...BASE_NOTIFICATION, read: true });

    const res = await markRead(makeRequest({}, "http://localhost/api/notifications/notif1/read"), {
      params: makeParamsPromise("notif1"),
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as { notification: { read: boolean } };
    expect(data.notification.read).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "notif1" }, data: { read: true } })
    );
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockRejectedValueOnce(new Error("DB error"));

    const res = await markRead(makeRequest({}, "http://localhost/api/notifications/notif1/read"), {
      params: makeParamsPromise("notif1"),
    });
    expect(res.status).toBe(500);
  });
});

// ── POST /api/notifications/read-all ─────────────────────────────────────────

describe("POST /api/notifications/read-all", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await markAllRead(makeRequest({}, "http://localhost/api/notifications/read-all"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await markAllRead(makeRequest({}, "http://localhost/api/notifications/read-all"));
    expect(res.status).toBe(429);
  });

  it("marks all unread notifications as read and returns count", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUpdateMany.mockResolvedValueOnce({ count: 5 });

    const res = await markAllRead(makeRequest({}, "http://localhost/api/notifications/read-all"));
    expect(res.status).toBe(200);

    const data = (await res.json()) as { markedRead: number };
    expect(data.markedRead).toBe(5);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID, read: false },
        data: { read: true },
      })
    );
  });

  it("returns 0 when no unread notifications exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await markAllRead(makeRequest({}, "http://localhost/api/notifications/read-all"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { markedRead: number };
    expect(data.markedRead).toBe(0);
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUpdateMany.mockRejectedValueOnce(new Error("DB error"));

    const res = await markAllRead(makeRequest({}, "http://localhost/api/notifications/read-all"));
    expect(res.status).toBe(500);
  });
});
