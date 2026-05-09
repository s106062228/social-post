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
    feedWidget: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    publishResult: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("ioredis", () => {
  return {
    Redis: jest.fn().mockImplementation(() => ({
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue("OK"),
    })),
  };
});

import { NextRequest } from "next/server";
import { GET as listWidgets, POST as createWidget } from "@/app/api/feed-widgets/route";
import {
  PATCH as updateWidget,
  DELETE as deleteWidget,
} from "@/app/api/feed-widgets/[id]/route";
import { GET as getPublicWidget } from "@/app/api/widget/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.feedWidget.findMany as jest.Mock;
const mockFindUnique = prisma.feedWidget.findUnique as jest.Mock;
const mockCreate = prisma.feedWidget.create as jest.Mock;
const mockUpdate = prisma.feedWidget.update as jest.Mock;
const mockDelete = prisma.feedWidget.delete as jest.Mock;
const mockCount = prisma.feedWidget.count as jest.Mock;
const mockPublishResultFindMany = prisma.publishResult.findMany as jest.Mock;

const USER_ID = "user-1";
const WIDGET_ID = "widget-1";
const AUTHED = { user: { id: USER_ID, email: "user@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_WIDGET = {
  id: WIDGET_ID,
  userId: USER_ID,
  name: "My Feed",
  accountIds: ["acc-1", "acc-2"],
  maxPosts: 10,
  theme: "light",
  showPlatformIcons: true,
  showTimestamps: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReq(url: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── GET /api/feed-widgets ──────────────────────────────────────────────────────

describe("GET /api/feed-widgets", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listWidgets();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await listWidgets();
    expect(res.status).toBe(429);
  });

  it("returns list of widgets", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([BASE_WIDGET]);
    const res = await listWidgets();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { widgets: typeof BASE_WIDGET[] };
    expect(data.widgets).toHaveLength(1);
    expect(data.widgets[0].name).toBe("My Feed");
  });

  it("returns empty list when no widgets", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await listWidgets();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { widgets: unknown[] };
    expect(data.widgets).toHaveLength(0);
  });
});

// ── POST /api/feed-widgets ─────────────────────────────────────────────────────

describe("POST /api/feed-widgets", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createWidget(makeReq("http://localhost/api/feed-widgets", "POST", {}));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await createWidget(makeReq("http://localhost/api/feed-widgets", "POST", {}));
    expect(res.status).toBe(429);
  });

  it("returns 400 for missing name", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createWidget(
      makeReq("http://localhost/api/feed-widgets", "POST", { accountIds: ["acc-1"] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty accountIds", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createWidget(
      makeReq("http://localhost/api/feed-widgets", "POST", { name: "Test", accountIds: [] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when max widgets exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockCount.mockResolvedValueOnce(10);
    const res = await createWidget(
      makeReq("http://localhost/api/feed-widgets", "POST", {
        name: "Extra",
        accountIds: ["acc-1"],
      })
    );
    expect(res.status).toBe(422);
  });

  it("creates widget and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_WIDGET);
    const res = await createWidget(
      makeReq("http://localhost/api/feed-widgets", "POST", {
        name: "My Feed",
        accountIds: ["acc-1", "acc-2"],
        maxPosts: 10,
        theme: "light",
      })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { widget: typeof BASE_WIDGET };
    expect(data.widget.name).toBe("My Feed");
  });
});

// ── PATCH /api/feed-widgets/[id] ──────────────────────────────────────────────

describe("PATCH /api/feed-widgets/[id]", () => {
  const params = Promise.resolve({ id: WIDGET_ID });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateWidget(
      makeReq(`http://localhost/api/feed-widgets/${WIDGET_ID}`, "PATCH", {}),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when widget not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await updateWidget(
      makeReq(`http://localhost/api/feed-widgets/${WIDGET_ID}`, "PATCH", { name: "New" }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when widget owned by another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_WIDGET, userId: "other-user" });
    const res = await updateWidget(
      makeReq(`http://localhost/api/feed-widgets/${WIDGET_ID}`, "PATCH", { name: "New" }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("updates widget successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_WIDGET);
    mockUpdate.mockResolvedValueOnce({ ...BASE_WIDGET, name: "Updated" });
    const res = await updateWidget(
      makeReq(`http://localhost/api/feed-widgets/${WIDGET_ID}`, "PATCH", { name: "Updated" }),
      { params }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { widget: { name: string } };
    expect(data.widget.name).toBe("Updated");
  });
});

// ── DELETE /api/feed-widgets/[id] ─────────────────────────────────────────────

describe("DELETE /api/feed-widgets/[id]", () => {
  const params = Promise.resolve({ id: WIDGET_ID });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteWidget(
      makeReq(`http://localhost/api/feed-widgets/${WIDGET_ID}`, "DELETE"),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when widget not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await deleteWidget(
      makeReq(`http://localhost/api/feed-widgets/${WIDGET_ID}`, "DELETE"),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("deletes widget and returns success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_WIDGET);
    mockDelete.mockResolvedValueOnce(BASE_WIDGET);
    const res = await deleteWidget(
      makeReq(`http://localhost/api/feed-widgets/${WIDGET_ID}`, "DELETE"),
      { params }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });
});

// ── GET /api/widget/[id] (public) ─────────────────────────────────────────────

describe("GET /api/widget/[id] (public)", () => {
  const params = Promise.resolve({ id: WIDGET_ID });

  it("returns 404 when widget not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await getPublicWidget(
      makeReq(`http://localhost/api/widget/${WIDGET_ID}`),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns widget data with posts", async () => {
    mockFindUnique.mockResolvedValueOnce(BASE_WIDGET);
    mockPublishResultFindMany.mockResolvedValueOnce([
      {
        id: "pr-1",
        platform: "FACEBOOK",
        publishedAt: new Date("2026-01-01"),
        publishedUrl: "https://fb.com/post/1",
        post: {
          id: "post-1",
          content: "Hello world",
          mediaType: "NONE",
          mediaUrls: [],
        },
      },
    ]);
    const res = await getPublicWidget(
      makeReq(`http://localhost/api/widget/${WIDGET_ID}`),
      { params }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      widgetId: string;
      posts: { content: string; platform: string }[];
      theme: string;
    };
    expect(data.widgetId).toBe(WIDGET_ID);
    expect(data.theme).toBe("light");
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].content).toBe("Hello world");
    expect(data.posts[0].platform).toBe("FACEBOOK");
  });

  it("returns empty posts array when no published posts", async () => {
    mockFindUnique.mockResolvedValueOnce(BASE_WIDGET);
    mockPublishResultFindMany.mockResolvedValueOnce([]);
    const res = await getPublicWidget(
      makeReq(`http://localhost/api/widget/${WIDGET_ID}`),
      { params }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { posts: unknown[] };
    expect(data.posts).toHaveLength(0);
  });
});
