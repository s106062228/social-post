// Mock ioredis before any imports
const mockOn = jest.fn();
const mockSubscribe = jest.fn().mockResolvedValue(undefined);
const mockQuit = jest.fn().mockResolvedValue(undefined);
const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);
const mockPublish = jest.fn().mockResolvedValue(1);

const mockRedisInstance = {
  on: mockOn,
  subscribe: mockSubscribe,
  quit: mockQuit,
  unsubscribe: mockUnsubscribe,
  publish: mockPublish,
};

const MockRedis = jest.fn().mockImplementation(() => mockRedisInstance);

jest.mock("ioredis", () => ({
  __esModule: true,
  default: MockRedis,
  Redis: MockRedis,
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  workerLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/sse/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = {
  user: { id: MOCK_USER_ID, email: "user@example.com" },
};
const RATE_LIMIT_OK = {
  success: true,
  limit: 100,
  remaining: 99,
  resetAt: new Date(),
};
const RATE_LIMIT_EXCEEDED = {
  success: false,
  limit: 100,
  remaining: 0,
  resetAt: new Date(),
};

function makeRequest(
  url = "http://localhost:3000/api/sse"
): NextRequest {
  return new NextRequest(url);
}

describe("GET /api/sse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: REDIS_URL is set
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterEach(() => {
    // Restore REDIS_URL
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 503 when REDIS_URL is not set", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    delete process.env.REDIS_URL;
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/SSE not available/i);
  });

  it("returns 200 with text/event-stream content type when authed", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });

  it("returns correct Cache-Control header (no-cache, no-transform)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await GET(makeRequest());
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
  });

  it("returns correct X-Accel-Buffering header (no)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await GET(makeRequest());
    expect(res.headers.get("x-accel-buffering")).toBe("no");
  });

  it("creates a Redis subscriber and subscribes to the correct channel", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    // Redis constructor should have been called with the REDIS_URL
    expect(MockRedis).toHaveBeenCalledWith(
      "redis://localhost:6379",
      expect.any(Object)
    );
    // Should subscribe to the user's notification channel
    expect(mockSubscribe).toHaveBeenCalledWith(
      `sse:notifications:${MOCK_USER_ID}`
    );
  });

  it("calls quit on subscriber when stream is cancelled", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await GET(makeRequest());
    expect(res.body).not.toBeNull();

    // Cancel the stream to trigger cleanup
    await res.body!.cancel();

    // quit should be called after unsubscribe
    expect(mockQuit).toHaveBeenCalled();
  });
});
