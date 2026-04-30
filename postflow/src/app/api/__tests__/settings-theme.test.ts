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

const BASE_USER = {
  id: MOCK_USER_ID,
  name: "Test User",
  email: "user@example.com",
  timezone: "UTC",
  emailNotifications: true,
  theme: "system",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

// ── Theme field in GET /api/settings ─────────────────────────────────────────

describe("GET /api/settings — theme field", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest() {
    return new NextRequest("http://localhost:3000/api/settings");
  }

  it("returns theme field in settings response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce(BASE_USER);
    const res = await getSettings(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_USER;
    expect(data.theme).toBe("system");
  });

  it("returns correct theme when user has dark theme stored", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce({ ...BASE_USER, theme: "dark" });
    const res = await getSettings(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_USER;
    expect(data.theme).toBe("dark");
  });
});

// ── Theme field in PATCH /api/settings ───────────────────────────────────────

describe("PATCH /api/settings — theme field", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("accepts theme=light and persists it", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const updated = { ...BASE_USER, theme: "light" };
    mockUserUpdate.mockResolvedValueOnce(updated);
    const res = await updateSettings(makeRequest({ theme: "light" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_USER;
    expect(data.theme).toBe("light");
  });

  it("accepts theme=dark and persists it", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const updated = { ...BASE_USER, theme: "dark" };
    mockUserUpdate.mockResolvedValueOnce(updated);
    const res = await updateSettings(makeRequest({ theme: "dark" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_USER;
    expect(data.theme).toBe("dark");
  });

  it("accepts theme=system and persists it", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const updated = { ...BASE_USER, theme: "system" };
    mockUserUpdate.mockResolvedValueOnce(updated);
    const res = await updateSettings(makeRequest({ theme: "system" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_USER;
    expect(data.theme).toBe("system");
  });

  it("rejects invalid theme value with 400", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await updateSettings(makeRequest({ theme: "midnight" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("passes theme in the prisma update data", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserUpdate.mockResolvedValueOnce(BASE_USER);
    await updateSettings(makeRequest({ theme: "dark" }));
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ theme: "dark" }),
      })
    );
  });

  it("allows updating theme alongside other fields", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const updated = { ...BASE_USER, theme: "light", timezone: "Asia/Tokyo" };
    mockUserUpdate.mockResolvedValueOnce(updated);
    const res = await updateSettings(
      makeRequest({ theme: "light", timezone: "Asia/Tokyo" })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_USER;
    expect(data.theme).toBe("light");
    expect(data.timezone).toBe("Asia/Tokyo");
  });
});
