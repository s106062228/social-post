jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
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

jest.mock("@/lib/activity-log", () => ({
  logActivity: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/settings/publishing-pause/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;
const mockLogActivity = logActivity as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_PAUSE_STATE = {
  publishingPaused: false,
  publishingPausedReason: null,
  publishingPausedAt: null,
};

const PAUSED_STATE = {
  publishingPaused: true,
  publishingPausedReason: "Reviewing content strategy",
  publishingPausedAt: new Date("2026-06-29T10:00:00.000Z"),
};

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/settings/publishing-pause");
}

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/settings/publishing-pause", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── GET /api/settings/publishing-pause ────────────────────────────────────────

describe("GET /api/settings/publishing-pause", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it("returns 404 when user not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(404);
  });

  it("returns paused=false by default when publishing is not paused", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce(BASE_PAUSE_STATE);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json() as { paused: boolean; reason: null; pausedAt: null };
    expect(data.paused).toBe(false);
    expect(data.reason).toBeNull();
    expect(data.pausedAt).toBeNull();
  });

  it("returns current paused state with reason and pausedAt when paused", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce(PAUSED_STATE);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json() as { paused: boolean; reason: string; pausedAt: string };
    expect(data.paused).toBe(true);
    expect(data.reason).toBe("Reviewing content strategy");
    expect(data.pausedAt).toBeTruthy();
  });
});

// ── PATCH /api/settings/publishing-pause ──────────────────────────────────────

describe("PATCH /api/settings/publishing-pause", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await PATCH(makePatchRequest({ paused: true }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await PATCH(makePatchRequest({ paused: true }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/settings/publishing-pause", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when paused field is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await PATCH(makePatchRequest({ reason: "just a reason" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when paused is not a boolean", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await PATCH(makePatchRequest({ paused: "yes" }));
    expect(res.status).toBe(400);
  });

  it("pauses publishing with a reason and sets pausedAt", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const now = new Date();
    mockUserUpdate.mockResolvedValueOnce({
      publishingPaused: true,
      publishingPausedReason: "Emergency maintenance",
      publishingPausedAt: now,
    });

    const res = await PATCH(
      makePatchRequest({ paused: true, reason: "Emergency maintenance" })
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { paused: boolean; reason: string; pausedAt: string };
    expect(data.paused).toBe(true);
    expect(data.reason).toBe("Emergency maintenance");
    expect(data.pausedAt).toBeTruthy();

    // Should have updated with paused=true and a timestamp
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishingPaused: true,
          publishingPausedReason: "Emergency maintenance",
        }),
      })
    );
  });

  it("pauses publishing without a reason", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserUpdate.mockResolvedValueOnce({
      publishingPaused: true,
      publishingPausedReason: null,
      publishingPausedAt: new Date(),
    });

    const res = await PATCH(makePatchRequest({ paused: true }));
    expect(res.status).toBe(200);
    const data = await res.json() as { paused: boolean; reason: null };
    expect(data.paused).toBe(true);
    expect(data.reason).toBeNull();
  });

  it("resumes publishing and clears reason and pausedAt", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserUpdate.mockResolvedValueOnce({
      publishingPaused: false,
      publishingPausedReason: null,
      publishingPausedAt: null,
    });

    const res = await PATCH(makePatchRequest({ paused: false }));
    expect(res.status).toBe(200);
    const data = await res.json() as { paused: boolean; reason: null; pausedAt: null };
    expect(data.paused).toBe(false);
    expect(data.reason).toBeNull();
    expect(data.pausedAt).toBeNull();

    // Should have cleared all pause fields
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishingPaused: false,
          publishingPausedReason: null,
          publishingPausedAt: null,
        }),
      })
    );
  });

  it("logs activity when pausing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserUpdate.mockResolvedValueOnce({
      publishingPaused: true,
      publishingPausedReason: "Test reason",
      publishingPausedAt: new Date(),
    });

    await PATCH(makePatchRequest({ paused: true, reason: "Test reason" }));

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MOCK_USER_ID,
        action: "publishing.paused",
      })
    );
  });

  it("logs activity when resuming", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserUpdate.mockResolvedValueOnce({
      publishingPaused: false,
      publishingPausedReason: null,
      publishingPausedAt: null,
    });

    await PATCH(makePatchRequest({ paused: false }));

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MOCK_USER_ID,
        action: "publishing.resumed",
      })
    );
  });

  it("returns 400 when reason exceeds 500 characters", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const longReason = "x".repeat(501);
    const res = await PATCH(makePatchRequest({ paused: true, reason: longReason }));
    expect(res.status).toBe(400);
  });
});
