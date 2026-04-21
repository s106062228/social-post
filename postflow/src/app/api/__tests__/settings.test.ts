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
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as getSettings, PATCH as updateSettings } from "@/app/api/settings/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_USER = {
  id: MOCK_USER_ID,
  name: "Test User",
  email: "user@example.com",
  timezone: "UTC",
  emailNotifications: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

// ── GET /api/settings ─────────────────────────────────────────────────────────

describe("GET /api/settings", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest() {
    return new NextRequest("http://localhost:3000/api/settings");
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getSettings(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await getSettings(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 404 when user does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce(null);
    const res = await getSettings(makeRequest());
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("User not found");
  });

  it("returns 200 with user settings", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce(BASE_USER);
    const res = await getSettings(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_USER;
    expect(data.id).toBe(MOCK_USER_ID);
    expect(data.email).toBe("user@example.com");
    expect(data.timezone).toBe("UTC");
    expect(data.emailNotifications).toBe(true);
  });

  it("queries prisma with the session user id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce(BASE_USER);
    await getSettings(makeRequest());
    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOCK_USER_ID } })
    );
  });

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockRejectedValueOnce(new Error("DB down"));
    const res = await getSettings(makeRequest());
    expect(res.status).toBe(500);
  });
});

// ── PATCH /api/settings ───────────────────────────────────────────────────────

describe("PATCH /api/settings", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateSettings(makeRequest({ timezone: "UTC" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await updateSettings(makeRequest({ timezone: "UTC" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/settings", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await updateSettings(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 for empty body (no fields)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await updateSettings(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is too long", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await updateSettings(makeRequest({ name: "x".repeat(101) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when timezone is empty string", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await updateSettings(makeRequest({ timezone: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 when updating timezone", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const updated = { ...BASE_USER, timezone: "Asia/Tokyo" };
    mockUserUpdate.mockResolvedValueOnce(updated);
    const res = await updateSettings(makeRequest({ timezone: "Asia/Tokyo" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_USER;
    expect(data.timezone).toBe("Asia/Tokyo");
  });

  it("returns 200 when updating emailNotifications", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const updated = { ...BASE_USER, emailNotifications: false };
    mockUserUpdate.mockResolvedValueOnce(updated);
    const res = await updateSettings(makeRequest({ emailNotifications: false }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_USER;
    expect(data.emailNotifications).toBe(false);
  });

  it("returns 200 when updating name", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const updated = { ...BASE_USER, name: "New Name" };
    mockUserUpdate.mockResolvedValueOnce(updated);
    const res = await updateSettings(makeRequest({ name: "New Name" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_USER;
    expect(data.name).toBe("New Name");
  });

  it("calls prisma.user.update with the correct user id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserUpdate.mockResolvedValueOnce(BASE_USER);
    await updateSettings(makeRequest({ timezone: "Europe/London" }));
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOCK_USER_ID } })
    );
  });

  it("includes all updated fields in the data payload", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserUpdate.mockResolvedValueOnce(BASE_USER);
    await updateSettings(
      makeRequest({ name: "Alice", timezone: "America/New_York", emailNotifications: false })
    );
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Alice", timezone: "America/New_York", emailNotifications: false },
      })
    );
  });

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserUpdate.mockRejectedValueOnce(new Error("DB down"));
    const res = await updateSettings(makeRequest({ timezone: "UTC" }));
    expect(res.status).toBe(500);
  });
});
