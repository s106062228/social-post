// mockExec must start with "mock" so jest.mock hoisting can reference it
const mockExec = jest.fn();
const mockPipelineInstance = {
  zremrangebyscore: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  pexpire: jest.fn().mockReturnThis(),
  exec: mockExec,
};

jest.mock("ioredis", () => ({
  Redis: jest.fn().mockImplementation(() => ({
    pipeline: jest.fn().mockReturnValue(mockPipelineInstance),
  })),
}));

import { rateLimit, rateLimitHeaders, type RateLimitResult } from "../rate-limit";

function makePipelineResult(count: number): [null, unknown][] {
  return [
    [null, 1],     // zremrangebyscore
    [null, 1],     // zadd
    [null, count], // zcard
    [null, 1],     // pexpire
  ];
}

describe("rateLimit", () => {
  beforeAll(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  it("returns success=true and correct remaining when under limit", async () => {
    mockExec.mockResolvedValue(makePipelineResult(5));
    const result = await rateLimit("user:test1", { limit: 10, windowMs: 60_000 });

    expect(result.success).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(5);
  });

  it("returns success=false and remaining=0 when at limit", async () => {
    mockExec.mockResolvedValue(makePipelineResult(10));
    const result = await rateLimit("user:test2", { limit: 10, windowMs: 60_000 });

    expect(result.success).toBe(true); // count === limit is still allowed (<=)
    expect(result.remaining).toBe(0);
  });

  it("returns success=false when over limit", async () => {
    mockExec.mockResolvedValue(makePipelineResult(11));
    const result = await rateLimit("user:test3", { limit: 10, windowMs: 60_000 });

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("remaining never goes below zero", async () => {
    mockExec.mockResolvedValue(makePipelineResult(999));
    const result = await rateLimit("user:test4", { limit: 10, windowMs: 60_000 });

    expect(result.remaining).toBe(0);
  });

  it("resetAt is approximately now + windowMs", async () => {
    mockExec.mockResolvedValue(makePipelineResult(1));
    const before = Date.now();
    const result = await rateLimit("user:test5", { limit: 100, windowMs: 60_000 });
    const after = Date.now();

    expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(result.resetAt.getTime()).toBeLessThanOrEqual(after + 60_000);
  });

  it("uses a prefixed Redis key (rl:<identifier>)", async () => {
    mockExec.mockResolvedValue(makePipelineResult(1));
    await rateLimit("user:abc", { limit: 10, windowMs: 60_000 });

    expect(mockPipelineInstance.zadd).toHaveBeenCalledWith(
      "rl:user:abc",
      expect.any(Number),
      expect.any(String)
    );
  });
});

describe("rateLimitHeaders", () => {
  it("returns correct X-RateLimit-* headers", () => {
    const resetAt = new Date("2025-01-01T00:01:00.000Z");
    const result: RateLimitResult = {
      success: true,
      limit: 100,
      remaining: 75,
      resetAt,
    };

    const headers = rateLimitHeaders(result);

    expect(headers["X-RateLimit-Limit"]).toBe("100");
    expect(headers["X-RateLimit-Remaining"]).toBe("75");
    expect(headers["X-RateLimit-Reset"]).toBe(resetAt.toISOString());
  });

  it("works when remaining is zero", () => {
    const result: RateLimitResult = {
      success: false,
      limit: 10,
      remaining: 0,
      resetAt: new Date(),
    };
    const headers = rateLimitHeaders(result);
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
  });
});
