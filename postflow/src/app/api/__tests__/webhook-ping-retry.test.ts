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
    webhookConfig: { findUnique: jest.fn() },
    webhookDelivery: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn().mockResolvedValue({ success: true, remaining: 99, reset: Date.now() }),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/webhook-dispatch", () => ({
  deliverWebhook: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST as pingPOST } from "@/app/api/webhook-configs/[id]/ping/route";
import { POST as retryPOST } from "@/app/api/webhook-configs/[id]/deliveries/[deliveryId]/retry/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { deliverWebhook } from "@/lib/webhook-dispatch";

const mockAuth = auth as jest.Mock;
const mockFindUniqueConfig = prisma.webhookConfig.findUnique as jest.Mock;
const mockFindUniqueDelivery = prisma.webhookDelivery.findUnique as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockDeliverWebhook = deliverWebhook as jest.Mock;

const USER_ID = "cluser0000000000000000001";
const OTHER_USER_ID = "cluser0000000000000000002";
const CONFIG_ID = "clconfig00000000000000001";
const DELIVERY_ID = "cldel000000000000000000001";

const AUTHED_SESSION = { user: { id: USER_ID, email: "user@example.com" } };

const SAMPLE_CONFIG = {
  userId: USER_ID,
  url: "https://example.com/webhook",
  secret: "secret123",
};

const SAMPLE_DELIVERY = {
  configId: CONFIG_ID,
  event: "post.failed",
};

function makePingRequest(configId = CONFIG_ID): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/webhook-configs/${configId}/ping`,
    { method: "POST" }
  );
}

function makeRetryRequest(configId = CONFIG_ID, deliveryId = DELIVERY_ID): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/webhook-configs/${configId}/deliveries/${deliveryId}/retry`,
    { method: "POST" }
  );
}

function makePingParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRetryParams(id: string, deliveryId: string) {
  return { params: Promise.resolve({ id, deliveryId }) };
}

const SUCCESS_RESULT = { success: true, statusCode: 200, durationMs: 150 };
const FAIL_RESULT = { success: false, statusCode: 500, durationMs: 200 };

describe("POST /api/webhook-configs/[id]/ping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true, remaining: 99, reset: Date.now() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await pingPOST(makePingRequest(), makePingParams(CONFIG_ID));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate-limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false, remaining: 0, reset: Date.now() });

    const res = await pingPOST(makePingRequest(), makePingParams(CONFIG_ID));
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  it("returns 404 when config does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce(null);

    const res = await pingPOST(makePingRequest(), makePingParams(CONFIG_ID));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Not found");
  });

  it("returns 404 when config belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce({ ...SAMPLE_CONFIG, userId: OTHER_USER_ID });

    const res = await pingPOST(makePingRequest(), makePingParams(CONFIG_ID));
    expect(res.status).toBe(404);
  });

  it("returns delivery result on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce(SAMPLE_CONFIG);
    mockDeliverWebhook.mockResolvedValueOnce(SUCCESS_RESULT);

    const res = await pingPOST(makePingRequest(), makePingParams(CONFIG_ID));
    expect(res.status).toBe(200);

    const data = (await res.json()) as { success: boolean; statusCode: number; durationMs: number };
    expect(data.success).toBe(true);
    expect(data.statusCode).toBe(200);
    expect(data.durationMs).toBe(150);
  });

  it("returns delivery result when webhook returns error status", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce(SAMPLE_CONFIG);
    mockDeliverWebhook.mockResolvedValueOnce(FAIL_RESULT);

    const res = await pingPOST(makePingRequest(), makePingParams(CONFIG_ID));
    expect(res.status).toBe(200);

    const data = (await res.json()) as { success: boolean; statusCode: number };
    expect(data.success).toBe(false);
    expect(data.statusCode).toBe(500);
  });

  it("calls deliverWebhook with ping event and config details", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce(SAMPLE_CONFIG);
    mockDeliverWebhook.mockResolvedValueOnce(SUCCESS_RESULT);

    await pingPOST(makePingRequest(), makePingParams(CONFIG_ID));

    expect(mockDeliverWebhook).toHaveBeenCalledWith(
      CONFIG_ID,
      SAMPLE_CONFIG.url,
      SAMPLE_CONFIG.secret,
      expect.objectContaining({ event: "ping" })
    );
  });
});

describe("POST /api/webhook-configs/[id]/deliveries/[deliveryId]/retry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true, remaining: 99, reset: Date.now() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await retryPOST(
      makeRetryRequest(),
      makeRetryParams(CONFIG_ID, DELIVERY_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false, remaining: 0, reset: Date.now() });

    const res = await retryPOST(
      makeRetryRequest(),
      makeRetryParams(CONFIG_ID, DELIVERY_ID)
    );
    expect(res.status).toBe(429);
  });

  it("returns 404 when config does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce(null);

    const res = await retryPOST(
      makeRetryRequest(),
      makeRetryParams(CONFIG_ID, DELIVERY_ID)
    );
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Not found");
  });

  it("returns 404 when config belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce({ ...SAMPLE_CONFIG, userId: OTHER_USER_ID });

    const res = await retryPOST(
      makeRetryRequest(),
      makeRetryParams(CONFIG_ID, DELIVERY_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when delivery does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce(SAMPLE_CONFIG);
    mockFindUniqueDelivery.mockResolvedValueOnce(null);

    const res = await retryPOST(
      makeRetryRequest(),
      makeRetryParams(CONFIG_ID, DELIVERY_ID)
    );
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Delivery not found");
  });

  it("returns 404 when delivery belongs to a different config", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce(SAMPLE_CONFIG);
    mockFindUniqueDelivery.mockResolvedValueOnce({
      configId: "clconfig00000000000000002",
      event: "post.failed",
    });

    const res = await retryPOST(
      makeRetryRequest(),
      makeRetryParams(CONFIG_ID, DELIVERY_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns delivery result on successful retry", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce(SAMPLE_CONFIG);
    mockFindUniqueDelivery.mockResolvedValueOnce(SAMPLE_DELIVERY);
    mockDeliverWebhook.mockResolvedValueOnce(SUCCESS_RESULT);

    const res = await retryPOST(
      makeRetryRequest(),
      makeRetryParams(CONFIG_ID, DELIVERY_ID)
    );
    expect(res.status).toBe(200);

    const data = (await res.json()) as { success: boolean; durationMs: number };
    expect(data.success).toBe(true);
    expect(data.durationMs).toBe(150);
  });

  it("calls deliverWebhook with original event type and retried_from reference", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUniqueConfig.mockResolvedValueOnce(SAMPLE_CONFIG);
    mockFindUniqueDelivery.mockResolvedValueOnce(SAMPLE_DELIVERY);
    mockDeliverWebhook.mockResolvedValueOnce(SUCCESS_RESULT);

    await retryPOST(makeRetryRequest(), makeRetryParams(CONFIG_ID, DELIVERY_ID));

    expect(mockDeliverWebhook).toHaveBeenCalledWith(
      CONFIG_ID,
      SAMPLE_CONFIG.url,
      SAMPLE_CONFIG.secret,
      expect.objectContaining({
        event: "post.failed",
        data: expect.objectContaining({ _retried_from: DELIVERY_ID }),
      })
    );
  });
});
