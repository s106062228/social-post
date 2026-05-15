jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
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
    notificationPreference: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/notification-preferences/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.notificationPreference.findMany as jest.Mock;
const mockUpsert = prisma.notificationPreference.upsert as jest.Mock;

const USER_ID = "cluser0001";
const SESSION = { user: { id: USER_ID } };
const RL_OK = { success: true };
const RL_FAIL = { success: false };

function makeRequest(method = "GET", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/notification-preferences", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockApiLimiter.mockResolvedValue(RL_OK);
  mockFindMany.mockResolvedValue([]);
  mockUpsert.mockResolvedValue({});
});

// ── GET tests ──────────────────────────────────────────────────────────────────

describe("GET /api/notification-preferences", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns all 8 notification types with defaults when no stored prefs", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { preferences: unknown[] };
    expect(body.preferences).toHaveLength(8);
    // All should default to true
    for (const pref of body.preferences as { inApp: boolean; email: boolean }[]) {
      expect(pref.inApp).toBe(true);
      expect(pref.email).toBe(true);
    }
  });

  it("merges stored prefs with defaults for missing types", async () => {
    mockFindMany.mockResolvedValue([
      { notificationType: "post.published", inApp: false, email: true },
    ]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      preferences: { type: string; inApp: boolean; email: boolean }[];
    };
    const published = body.preferences.find((p) => p.type === "post.published");
    expect(published?.inApp).toBe(false);
    expect(published?.email).toBe(true);
    // Other types should still default to true
    const failed = body.preferences.find((p) => p.type === "post.failed");
    expect(failed?.inApp).toBe(true);
    expect(failed?.email).toBe(true);
  });

  it("returns stored values for all types", async () => {
    mockFindMany.mockResolvedValue([
      { notificationType: "post.failed", inApp: true, email: false },
      { notificationType: "post.reminder", inApp: false, email: false },
    ]);
    const res = await GET(makeRequest());
    const body = (await res.json()) as {
      preferences: { type: string; inApp: boolean; email: boolean }[];
    };
    const failed = body.preferences.find((p) => p.type === "post.failed");
    expect(failed?.email).toBe(false);
    const reminder = body.preferences.find((p) => p.type === "post.reminder");
    expect(reminder?.inApp).toBe(false);
    expect(reminder?.email).toBe(false);
  });

  it("includes type and label fields in each item", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    const body = (await res.json()) as {
      preferences: { type: string; label: string }[];
    };
    expect(body.preferences[0]).toHaveProperty("type");
    expect(body.preferences[0]).toHaveProperty("label");
    expect(typeof body.preferences[0].label).toBe("string");
    expect(body.preferences[0].label.length).toBeGreaterThan(0);
  });
});

// ── PATCH tests ────────────────────────────────────────────────────────────────

describe("PATCH /api/notification-preferences", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeRequest("PATCH", { preferences: [] }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await PATCH(
      makeRequest("PATCH", {
        preferences: [{ type: "post.published", inApp: false, email: true }],
      })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 for empty preferences array", async () => {
    const res = await PATCH(makeRequest("PATCH", { preferences: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid notification type", async () => {
    const res = await PATCH(
      makeRequest("PATCH", {
        preferences: [{ type: "invalid.type", inApp: true, email: true }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("upserts a single preference and returns updated list", async () => {
    mockFindMany.mockResolvedValue([
      { notificationType: "post.published", inApp: false, email: true },
    ]);
    const res = await PATCH(
      makeRequest("PATCH", {
        preferences: [{ type: "post.published", inApp: false, email: true }],
      })
    );
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_notificationType: {
            userId: USER_ID,
            notificationType: "post.published",
          },
        },
        create: expect.objectContaining({ inApp: false, email: true }),
        update: expect.objectContaining({ inApp: false, email: true }),
      })
    );
    const body = (await res.json()) as { preferences: unknown[] };
    expect(body.preferences).toHaveLength(8);
  });

  it("upserts multiple preferences in one call", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await PATCH(
      makeRequest("PATCH", {
        preferences: [
          { type: "post.published", inApp: false, email: false },
          { type: "post.failed", inApp: true, email: false },
        ],
      })
    );
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });
});
