jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: {
    FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS",
    TWITTER: "TWITTER", BLUESKY: "BLUESKY", MASTODON: "MASTODON",
  },
  PostStatus: {
    DRAFT: "DRAFT", SCHEDULED: "SCHEDULED", PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED", PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED", FAILED: "FAILED",
  },
  PublishStatus: {
    PENDING: "PENDING", PROCESSING: "PROCESSING", PUBLISHED: "PUBLISHED", FAILED: "FAILED",
  },
  Prisma: {
    PrismaClientKnownRequestError: class extends Error { code: string; constructor(m: string, o: { code: string }) { super(m); this.code = o.code; } },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/smart-schedule", () => ({
  getSmartScheduleSuggestions: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/suggest-schedule/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { getSmartScheduleSuggestions } from "@/lib/smart-schedule";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGetSuggestions = getSmartScheduleSuggestions as jest.Mock;

function makeRequest(body: unknown = {}) {
  return new NextRequest("http://localhost/api/posts/suggest-schedule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "user1" } });
  mockApiLimiter.mockResolvedValue({ success: true, remaining: 99, reset: 0, limit: 100 });
  mockGetSuggestions.mockResolvedValue([]);
});

describe("POST /api/posts/suggest-schedule", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false, remaining: 0, reset: 1000, limit: 100 });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid platform value", async () => {
    const res = await POST(makeRequest({ platforms: ["INVALID_PLATFORM"] }));
    expect(res.status).toBe(400);
  });

  it("returns empty suggestions when no history", async () => {
    mockGetSuggestions.mockResolvedValue([]);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const data = await res.json() as { suggestions: unknown[] };
    expect(data.suggestions).toEqual([]);
  });

  it("returns suggestions from the utility", async () => {
    const mockSuggestions = [
      { datetime: "2026-05-20T10:00:00.000Z", dayLabel: "Wednesday", timeLabel: "10:00 AM", reason: "High engagement", score: 42 },
      { datetime: "2026-05-22T14:00:00.000Z", dayLabel: "Friday", timeLabel: "2:00 PM", reason: "High engagement", score: 38 },
    ];
    mockGetSuggestions.mockResolvedValue(mockSuggestions);

    const res = await POST(makeRequest({ platforms: ["FACEBOOK"], timezone: "UTC" }));
    expect(res.status).toBe(200);
    const data = await res.json() as { suggestions: typeof mockSuggestions };
    expect(data.suggestions).toHaveLength(2);
    expect(data.suggestions[0].dayLabel).toBe("Wednesday");
    expect(data.suggestions[0].timeLabel).toBe("10:00 AM");
    expect(data.suggestions[0].score).toBe(42);
  });

  it("passes platforms and timezone to the utility", async () => {
    await POST(makeRequest({ platforms: ["INSTAGRAM"], timezone: "America/New_York" }));
    expect(mockGetSuggestions).toHaveBeenCalledWith("user1", ["INSTAGRAM"], "America/New_York");
  });

  it("defaults to empty platforms and UTC when not provided", async () => {
    await POST(makeRequest({}));
    expect(mockGetSuggestions).toHaveBeenCalledWith("user1", [], "UTC");
  });

  it("returns 200 with each suggestion having required fields", async () => {
    mockGetSuggestions.mockResolvedValue([
      { datetime: "2026-05-20T10:00:00.000Z", dayLabel: "Wednesday", timeLabel: "10:00 AM", reason: "Test", score: 10 },
    ]);
    const res = await POST(makeRequest());
    const data = await res.json() as { suggestions: Array<{ datetime: string; dayLabel: string; timeLabel: string; reason: string; score: number }> };
    const s = data.suggestions[0];
    expect(s.datetime).toBeDefined();
    expect(s.dayLabel).toBeDefined();
    expect(s.timeLabel).toBeDefined();
    expect(s.reason).toBeDefined();
    expect(typeof s.score).toBe("number");
  });
});
