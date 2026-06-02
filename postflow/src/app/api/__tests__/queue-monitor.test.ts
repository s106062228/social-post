jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, resetAt: new Date() }),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/queue/connection", () => ({
  createRedisConnection: jest.fn().mockReturnValue({}),
  QUEUE_NAMES: { PUBLISH: "postflow:publish" },
}));

// Mock BullMQ Queue
const mockGetJobCounts = jest.fn();
const mockGetJobs = jest.fn();
const mockGetJob = jest.fn();
const mockClose = jest.fn().mockResolvedValue(undefined);

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    getJobCounts: mockGetJobCounts,
    getJobs: mockGetJobs,
    getJob: mockGetJob,
    close: mockClose,
  })),
}));

import { NextRequest } from "next/server";
import { GET as getStatus } from "@/app/api/queue/status/route";
import { GET as getJobs } from "@/app/api/queue/jobs/route";
import { POST as retryJob } from "@/app/api/queue/jobs/[jobId]/retry/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

function makeRequest(url = "http://localhost/api/queue/status", method = "GET") {
  return new NextRequest(url, { method });
}

describe("GET /api/queue/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getStatus(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockApiLimiter.mockResolvedValue({ success: false, limit: 100, remaining: 0, resetAt: new Date() });
    const res = await getStatus(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns queue counts with all fields", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetJobCounts.mockResolvedValue({
      waiting: 3, active: 1, completed: 50, failed: 2, delayed: 4, paused: 0,
    });
    const res = await getStatus(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ waiting: 3, active: 1, completed: 50, failed: 2, delayed: 4, paused: 0 });
  });

  it("returns zeros when Redis is unavailable", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetJobCounts.mockRejectedValue(new Error("Connection refused"));
    const res = await getStatus(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 });
  });
});

describe("GET /api/queue/jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getJobs(makeRequest("http://localhost/api/queue/jobs"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockApiLimiter.mockResolvedValue({ success: false, limit: 100, remaining: 0, resetAt: new Date() });
    const res = await getJobs(makeRequest("http://localhost/api/queue/jobs"));
    expect(res.status).toBe(429);
  });

  it("filters jobs by current userId", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const now = Date.now();
    // Called once per state (waiting, active, failed, delayed) — return u1 job only for waiting
    mockGetJobs
      .mockResolvedValueOnce([
        { id: "j1", data: { userId: "u1", postId: "p1", platform: "FACEBOOK" }, attemptsMade: 0, timestamp: now },
        { id: "j2", data: { userId: "u2", postId: "p2", platform: "INSTAGRAM" }, attemptsMade: 1, timestamp: now },
      ])
      .mockResolvedValue([]); // active, failed, delayed return empty
    const res = await getJobs(makeRequest("http://localhost/api/queue/jobs"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].id).toBe("j1");
  });

  it("filters by state param", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetJobs.mockResolvedValue([
      { id: "j3", data: { userId: "u1", postId: "p3", platform: "THREADS" }, attemptsMade: 3, timestamp: Date.now(), failedReason: "timeout" },
    ]);
    const res = await getJobs(makeRequest("http://localhost/api/queue/jobs?state=failed"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs[0].state).toBe("failed");
    expect(body.jobs[0].failedReason).toBe("timeout");
  });

  it("returns empty list when Redis is unavailable", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetJobs.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await getJobs(makeRequest("http://localhost/api/queue/jobs"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toEqual([]);
  });
});

describe("POST /api/queue/jobs/[jobId]/retry", () => {
  const mockRetry = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await retryJob(makeRequest("http://localhost/api/queue/jobs/j1/retry", "POST"), {
      params: Promise.resolve({ jobId: "j1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockApiLimiter.mockResolvedValue({ success: false, limit: 100, remaining: 0, resetAt: new Date() });
    const res = await retryJob(makeRequest("http://localhost/api/queue/jobs/j1/retry", "POST"), {
      params: Promise.resolve({ jobId: "j1" }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when job not found", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetJob.mockResolvedValue(null);
    const res = await retryJob(makeRequest("http://localhost/api/queue/jobs/j1/retry", "POST"), {
      params: Promise.resolve({ jobId: "j1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when job belongs to different user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetJob.mockResolvedValue({ id: "j1", data: { userId: "u2" }, retry: mockRetry, close: mockClose });
    const res = await retryJob(makeRequest("http://localhost/api/queue/jobs/j1/retry", "POST"), {
      params: Promise.resolve({ jobId: "j1" }),
    });
    expect(res.status).toBe(403);
  });

  it("retries job successfully", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockRetry.mockResolvedValue(undefined);
    mockGetJob.mockResolvedValue({ id: "j1", data: { userId: "u1" }, retry: mockRetry });
    const res = await retryJob(makeRequest("http://localhost/api/queue/jobs/j1/retry", "POST"), {
      params: Promise.resolve({ jobId: "j1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockRetry).toHaveBeenCalled();
  });
});
