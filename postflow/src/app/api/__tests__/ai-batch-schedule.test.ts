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
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) { super(msg); this.code = opts.code; }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({ prisma: { post: { findMany: jest.fn(), update: jest.fn() } } }));

jest.mock("@/lib/activity-log", () => ({ logActivity: jest.fn() }));

jest.mock("@/lib/smart-schedule", () => ({
  getSmartScheduleSuggestions: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/batch-schedule/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { getSmartScheduleSuggestions } from "@/lib/smart-schedule";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;
const mockUpdate = prisma.post.update as jest.Mock;
const mockSuggest = getSmartScheduleSuggestions as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED = { user: { id: MOCK_USER_ID } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const FUTURE_ISO = new Date(Date.now() + 86_400_000).toISOString();

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/batch-schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);
  mockUpdate.mockResolvedValue({});
});

describe("POST /api/ai/batch-schedule", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ postIds: ["clh3ck8zp0001qr5hyvxckahk"] }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await POST(makeRequest({ postIds: ["clh3ck8zp0001qr5hyvxckahk"] }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/batch-schedule", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty postIds", async () => {
    const res = await POST(makeRequest({ postIds: [] }));
    expect(res.status).toBe(400);
  });

  it("fails non-DRAFT post with reason", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "clh3ck8zp0001qr5hyvxckahk", userId: MOCK_USER_ID, status: "SCHEDULED" },
    ]);
    mockSuggest.mockResolvedValue([]);

    const res = await POST(makeRequest({ postIds: ["clh3ck8zp0001qr5hyvxckahk"] }));
    expect(res.status).toBe(200);
    const data = await res.json() as { scheduled: unknown[]; failed: { reason: string }[] };
    expect(data.scheduled).toHaveLength(0);
    expect(data.failed[0].reason).toContain("scheduled");
  });

  it("fails post owned by another user", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "clh3ck8zp0001qr5hyvxckahk", userId: "other-user-id", status: "DRAFT" },
    ]);
    mockSuggest.mockResolvedValue([]);

    const res = await POST(makeRequest({ postIds: ["clh3ck8zp0001qr5hyvxckahk"] }));
    expect(res.status).toBe(200);
    const data = await res.json() as { scheduled: unknown[]; failed: { reason: string }[] };
    expect(data.failed[0].reason).toBe("Forbidden");
  });

  it("schedules a DRAFT post using smart-schedule suggestions", async () => {
    const postId = "clh3ck8zp0001qr5hyvxckahk";
    mockFindMany.mockResolvedValueOnce([
      { id: postId, userId: MOCK_USER_ID, status: "DRAFT" },
    ]);
    mockSuggest.mockResolvedValue([
      { datetime: FUTURE_ISO, dayLabel: "Monday", timeLabel: "10:00 AM", reason: "High engagement", score: 42 },
    ]);

    const res = await POST(makeRequest({ postIds: [postId] }));
    expect(res.status).toBe(200);
    const data = await res.json() as { scheduled: { postId: string; scheduledAt: string; reason: string }[]; failed: unknown[] };
    expect(data.scheduled).toHaveLength(1);
    expect(data.scheduled[0].postId).toBe(postId);
    expect(data.scheduled[0].scheduledAt).toBe(FUTURE_ISO);
    expect(data.scheduled[0].reason).toBe("High engagement");
    expect(data.failed).toHaveLength(0);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: postId },
      data: expect.objectContaining({ status: "SCHEDULED" }),
    }));
  });

  it("falls back to daily slots when no smart-schedule history", async () => {
    const postId = "clh3ck8zp0001qr5hyvxckahk";
    mockFindMany.mockResolvedValueOnce([
      { id: postId, userId: MOCK_USER_ID, status: "DRAFT" },
    ]);
    mockSuggest.mockResolvedValue([]); // no history

    const res = await POST(makeRequest({ postIds: [postId], timezone: "UTC" }));
    expect(res.status).toBe(200);
    const data = await res.json() as { scheduled: { reason: string }[]; failed: unknown[] };
    expect(data.scheduled).toHaveLength(1);
    expect(data.scheduled[0].reason).toContain("morning");
    expect(data.failed).toHaveLength(0);
  });

  it("returns partial success when some posts fail", async () => {
    const goodId = "clh3ck8zp0001qr5hyvxckahk";
    const badId = "clh3ck8zp0002qr5hyvxckahk";
    mockFindMany.mockResolvedValueOnce([
      { id: goodId, userId: MOCK_USER_ID, status: "DRAFT" },
      { id: badId, userId: MOCK_USER_ID, status: "PUBLISHED" },
    ]);
    mockSuggest.mockResolvedValue([
      { datetime: FUTURE_ISO, dayLabel: "Tuesday", timeLabel: "2:00 PM", reason: "Good time", score: 30 },
    ]);

    const res = await POST(makeRequest({ postIds: [goodId, badId] }));
    expect(res.status).toBe(200);
    const data = await res.json() as { scheduled: unknown[]; failed: unknown[] };
    expect(data.scheduled).toHaveLength(1);
    expect(data.failed).toHaveLength(1);
  });

  it("handles not-found post gracefully", async () => {
    mockFindMany.mockResolvedValueOnce([]); // post not found in DB
    const res = await POST(makeRequest({ postIds: ["clh3ck8zp0001qr5hyvxckahk"] }));
    expect(res.status).toBe(200);
    const data = await res.json() as { scheduled: unknown[]; failed: { reason: string }[] };
    expect(data.failed[0].reason).toBe("Post not found");
  });
});
