jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
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

jest.mock("@/lib/db", () => ({
  prisma: {
    webhookConfig: {
      findUnique: jest.fn(),
    },
    webhookDelivery: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn().mockResolvedValue({ success: true, remaining: 99, reset: Date.now() }),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/webhook-configs/[id]/deliveries/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockFindUniqueConfig = prisma.webhookConfig.findUnique as jest.Mock;
const mockFindManyDeliveries = prisma.webhookDelivery.findMany as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const USER_ID = "cluser0000000000000000001";
const OTHER_USER_ID = "cluser0000000000000000002";
const CONFIG_ID = "clconfig00000000000000001";

const AUTHED_SESSION = { user: { id: USER_ID, email: "user@example.com" } };

const SAMPLE_DELIVERIES = [
  {
    id: "cldel000000000000000000001",
    event: "post.published",
    statusCode: 200,
    success: true,
    durationMs: 142,
    attemptedAt: new Date("2026-05-01T10:00:00Z"),
  },
  {
    id: "cldel000000000000000000002",
    event: "post.failed",
    statusCode: 500,
    success: false,
    durationMs: 310,
    attemptedAt: new Date("2026-05-01T09:00:00Z"),
  },
  {
    id: "cldel000000000000000000003",
    event: "post.failed",
    statusCode: null,
    success: false,
    durationMs: 10_001,
    attemptedAt: new Date("2026-05-01T08:00:00Z"),
  },
];

function makeRequest(configId = CONFIG_ID): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/webhook-configs/${configId}/deliveries`,
    { method: "GET" }
  );
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/webhook-configs/[id]/deliveries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true, remaining: 99, reset: Date.now() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(makeRequest(), makeParams(CONFIG_ID));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate-limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false, remaining: 0, reset: Date.now() });

    const res = await GET(makeRequest(), makeParams(CONFIG_ID));
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  it("returns 404 when config does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce(null);

    const res = await GET(makeRequest(), makeParams(CONFIG_ID));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Not found");
  });

  it("returns 404 when config belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce({ userId: OTHER_USER_ID });

    const res = await GET(makeRequest(), makeParams(CONFIG_ID));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Not found");
  });

  it("returns empty deliveries array when no records exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce({ userId: USER_ID });
    mockFindManyDeliveries.mockResolvedValueOnce([]);

    const res = await GET(makeRequest(), makeParams(CONFIG_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { deliveries: unknown[] };
    expect(data.deliveries).toEqual([]);
  });

  it("returns deliveries with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce({ userId: USER_ID });
    mockFindManyDeliveries.mockResolvedValueOnce(SAMPLE_DELIVERIES);

    const res = await GET(makeRequest(), makeParams(CONFIG_ID));
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      deliveries: {
        id: string;
        event: string;
        statusCode: number | null;
        success: boolean;
        durationMs: number;
        attemptedAt: string;
      }[];
    };

    expect(data.deliveries).toHaveLength(3);
    expect(data.deliveries[0].event).toBe("post.published");
    expect(data.deliveries[0].statusCode).toBe(200);
    expect(data.deliveries[0].success).toBe(true);
    expect(data.deliveries[0].durationMs).toBe(142);
    expect(data.deliveries[1].success).toBe(false);
    expect(data.deliveries[2].statusCode).toBeNull();
  });

  it("queries deliveries for the correct configId ordered by attemptedAt desc", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce({ userId: USER_ID });
    mockFindManyDeliveries.mockResolvedValueOnce(SAMPLE_DELIVERIES);

    await GET(makeRequest(), makeParams(CONFIG_ID));

    expect(mockFindManyDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { configId: CONFIG_ID },
        orderBy: { attemptedAt: "desc" },
        take: 50,
      })
    );
  });

  it("returns 500 on unexpected Prisma error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await GET(makeRequest(), makeParams(CONFIG_ID));
    expect(res.status).toBe(500);
  });
});
