jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  dbLogger: { error: jest.fn() },
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
  PostStatus: { DRAFT: "DRAFT", SCHEDULED: "SCHEDULED" },
  MediaType: { NONE: "NONE", IMAGE: "IMAGE" },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimit: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    inboundWebhook: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    webhookTriggerLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    post: {
      create: jest.fn(),
    },
  },
}));

jest.mock("crypto", () => {
  const actual = jest.requireActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    randomBytes: jest.fn().mockReturnValue(Buffer.from("a".repeat(32))),
    timingSafeEqual: jest.fn(),
  };
});

import { NextRequest } from "next/server";
import { GET as listWebhooks, POST as createWebhook } from "@/app/api/inbound-webhooks/route";
import {
  PATCH as updateWebhook,
  DELETE as deleteWebhook,
} from "@/app/api/inbound-webhooks/[id]/route";
import { GET as getLogs } from "@/app/api/inbound-webhooks/[id]/logs/route";
import { POST as triggerWebhook } from "@/app/api/trigger/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimit } from "@/lib/rate-limit";
import * as crypto from "crypto";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockRateLimit = rateLimit as jest.Mock;
const mockTimingSafeEqual = crypto.timingSafeEqual as jest.Mock;

const mockFindMany = (prisma.inboundWebhook.findMany as jest.Mock);
const mockFindUnique = (prisma.inboundWebhook.findUnique as jest.Mock);
const mockCreate = (prisma.inboundWebhook.create as jest.Mock);
const mockUpdate = (prisma.inboundWebhook.update as jest.Mock);
const mockDelete = (prisma.inboundWebhook.delete as jest.Mock);
const mockCount = (prisma.inboundWebhook.count as jest.Mock);
const mockLogCreate = (prisma.webhookTriggerLog.create as jest.Mock);
const mockLogFindMany = (prisma.webhookTriggerLog.findMany as jest.Mock);
const mockPostCreate = (prisma.post.create as jest.Mock);

const USER_ID = "cluser0001";
const OTHER_ID = "cluser9999";
const WEBHOOK_ID = "clwh0001";
const AUTHED_SESSION = { user: { id: USER_ID, email: "user@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_WEBHOOK = {
  id: WEBHOOK_ID,
  userId: USER_ID,
  name: "My Zapier Hook",
  secret: "a".repeat(64),
  fieldMapping: { contentField: "content", scheduledAtField: "scheduledAt" },
  defaultPlatforms: [],
  isActive: true,
  lastTriggeredAt: null,
  triggerCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(url: string, opts?: RequestInit) {
  return new NextRequest(url, opts);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RL_OK);
  mockRateLimit.mockResolvedValue(RL_OK);
  mockTimingSafeEqual.mockReturnValue(true);
});

// ── GET /api/inbound-webhooks ─────────────────────────────────────────────────

describe("GET /api/inbound-webhooks", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listWebhooks();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_EXCEEDED);
    const res = await listWebhooks();
    expect(res.status).toBe(429);
  });

  it("returns list of webhooks (no secret in response)", async () => {
    // Simulate what Prisma's select returns — no secret field
    const { secret: _s, ...webhookWithoutSecret } = BASE_WEBHOOK;
    mockFindMany.mockResolvedValue([webhookWithoutSecret]);
    const res = await listWebhooks();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { webhooks: typeof webhookWithoutSecret[] };
    expect(body.webhooks).toHaveLength(1);
    expect(body.webhooks[0].name).toBe("My Zapier Hook");
    // Secret must not appear in list response
    expect(body.webhooks[0]).not.toHaveProperty("secret");
  });

  it("returns empty array when no webhooks exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await listWebhooks();
    const body = (await res.json()) as { webhooks: unknown[] };
    expect(body.webhooks).toHaveLength(0);
  });
});

// ── POST /api/inbound-webhooks ────────────────────────────────────────────────

describe("POST /api/inbound-webhooks", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await createWebhook(makeRequest("http://localhost/api/inbound-webhooks", {
      method: "POST",
      body: JSON.stringify({ name: "Test" }),
      headers: { "Content-Type": "application/json" },
    }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_EXCEEDED);
    const res = await createWebhook(makeRequest("http://localhost/api/inbound-webhooks", {
      method: "POST",
      body: JSON.stringify({ name: "Test" }),
      headers: { "Content-Type": "application/json" },
    }));
    expect(res.status).toBe(429);
  });

  it("returns 422 when max webhooks reached", async () => {
    mockCount.mockResolvedValue(20);
    const res = await createWebhook(makeRequest("http://localhost/api/inbound-webhooks", {
      method: "POST",
      body: JSON.stringify({ name: "Test" }),
      headers: { "Content-Type": "application/json" },
    }));
    expect(res.status).toBe(422);
  });

  it("returns 400 on invalid JSON", async () => {
    mockCount.mockResolvedValue(0);
    const res = await createWebhook(makeRequest("http://localhost/api/inbound-webhooks", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    }));
    expect(res.status).toBe(400);
  });

  it("creates webhook and returns secret once", async () => {
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue({ ...BASE_WEBHOOK, secret: "generated-secret-abc" });

    const res = await createWebhook(makeRequest("http://localhost/api/inbound-webhooks", {
      method: "POST",
      body: JSON.stringify({ name: "Test Hook" }),
      headers: { "Content-Type": "application/json" },
    }));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { webhook: { name: string; secret?: string } };
    expect(body.webhook.name).toBe("My Zapier Hook"); // from mock
    // Secret is returned on creation
    expect(body.webhook.secret).toBeDefined();
  });
});

// ── PATCH /api/inbound-webhooks/[id] ─────────────────────────────────────────

describe("PATCH /api/inbound-webhooks/[id]", () => {
  const params = Promise.resolve({ id: WEBHOOK_ID });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await updateWebhook(
      makeRequest("http://localhost", { method: "PATCH", body: JSON.stringify({ isActive: false }) }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown webhook", async () => {
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindUnique.mockResolvedValue(null);
    const res = await updateWebhook(
      makeRequest("http://localhost", { method: "PATCH", body: JSON.stringify({ isActive: false }) }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for wrong owner", async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_WEBHOOK, userId: OTHER_ID });
    const res = await updateWebhook(
      makeRequest("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
        headers: { "Content-Type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(403);
  });

  it("updates webhook successfully", async () => {
    mockFindUnique.mockResolvedValue(BASE_WEBHOOK);
    mockUpdate.mockResolvedValue({ ...BASE_WEBHOOK, isActive: false });
    const res = await updateWebhook(
      makeRequest("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
        headers: { "Content-Type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { webhook: { isActive: boolean } };
    expect(body.webhook.isActive).toBe(false);
  });
});

// ── DELETE /api/inbound-webhooks/[id] ────────────────────────────────────────

describe("DELETE /api/inbound-webhooks/[id]", () => {
  const params = Promise.resolve({ id: WEBHOOK_ID });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await deleteWebhook(
      makeRequest("http://localhost", { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown webhook", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await deleteWebhook(
      makeRequest("http://localhost", { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful delete", async () => {
    mockFindUnique.mockResolvedValue(BASE_WEBHOOK);
    mockDelete.mockResolvedValue(BASE_WEBHOOK);
    const res = await deleteWebhook(
      makeRequest("http://localhost", { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(204);
  });
});

// ── GET /api/inbound-webhooks/[id]/logs ──────────────────────────────────────

describe("GET /api/inbound-webhooks/[id]/logs", () => {
  const params = Promise.resolve({ id: WEBHOOK_ID });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getLogs(
      makeRequest("http://localhost", { method: "GET" }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown webhook", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await getLogs(
      makeRequest("http://localhost", { method: "GET" }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for wrong owner", async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_WEBHOOK, userId: OTHER_ID });
    const res = await getLogs(
      makeRequest("http://localhost", { method: "GET" }),
      { params }
    );
    expect(res.status).toBe(403);
  });

  it("returns logs with correct shape", async () => {
    mockFindUnique.mockResolvedValue(BASE_WEBHOOK);
    mockLogFindMany.mockResolvedValue([
      {
        id: "log1",
        webhookId: WEBHOOK_ID,
        success: true,
        statusCode: 201,
        requestBody: { content: "Hello" },
        errorMessage: null,
        createdAt: new Date(),
      },
    ]);
    const res = await getLogs(
      makeRequest("http://localhost", { method: "GET" }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[] };
    expect(body.logs).toHaveLength(1);
    expect((body.logs[0] as { success: boolean }).success).toBe(true);
  });
});

// ── POST /api/trigger/[id] ────────────────────────────────────────────────────

describe("POST /api/trigger/[id]", () => {
  const params = Promise.resolve({ id: WEBHOOK_ID });

  beforeEach(() => {
    mockRateLimit.mockResolvedValue(RL_OK);
    mockTimingSafeEqual.mockReturnValue(true);
  });

  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockResolvedValue(RL_EXCEEDED);
    const res = await triggerWebhook(
      makeRequest("http://localhost/api/trigger/WEBHOOK_ID", {
        method: "POST",
        headers: { "x-webhook-secret": "abc" },
        body: JSON.stringify({ content: "test" }),
      }),
      { params }
    );
    expect(res.status).toBe(429);
  });

  it("returns 401 when secret header is missing", async () => {
    mockFindUnique.mockResolvedValue(BASE_WEBHOOK);
    const res = await triggerWebhook(
      makeRequest("http://localhost/api/trigger/WEBHOOK_ID", {
        method: "POST",
        body: JSON.stringify({ content: "test" }),
      }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when webhook not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await triggerWebhook(
      makeRequest("http://localhost/api/trigger/WEBHOOK_ID", {
        method: "POST",
        headers: { "x-webhook-secret": "wrong" },
        body: JSON.stringify({ content: "test" }),
      }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 with invalid secret and logs failure", async () => {
    mockFindUnique.mockResolvedValue(BASE_WEBHOOK);
    mockTimingSafeEqual.mockReturnValue(false);
    mockLogCreate.mockResolvedValue({});

    const res = await triggerWebhook(
      makeRequest("http://localhost/api/trigger/WEBHOOK_ID", {
        method: "POST",
        headers: { "x-webhook-secret": "wrong-secret" },
        body: JSON.stringify({ content: "test" }),
      }),
      { params }
    );
    expect(res.status).toBe(401);
    expect(mockLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ success: false, statusCode: 401 }),
      })
    );
  });

  it("creates post with valid secret and correct field mapping", async () => {
    mockFindUnique.mockResolvedValue(BASE_WEBHOOK);
    mockTimingSafeEqual.mockReturnValue(true);
    mockPostCreate.mockResolvedValue({ id: "newpost123", status: "DRAFT" });
    mockLogCreate.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

    const res = await triggerWebhook(
      makeRequest("http://localhost/api/trigger/WEBHOOK_ID", {
        method: "POST",
        headers: { "x-webhook-secret": BASE_WEBHOOK.secret, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hello from automation!" }),
      }),
      { params }
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { postId: string; status: string };
    expect(body.postId).toBe("newpost123");
    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: "Hello from automation!" }),
      })
    );
  });

  it("creates SCHEDULED post when future scheduledAt is provided", async () => {
    mockFindUnique.mockResolvedValue(BASE_WEBHOOK);
    mockTimingSafeEqual.mockReturnValue(true);
    mockPostCreate.mockResolvedValue({ id: "sched123", status: "SCHEDULED" });
    mockLogCreate.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await triggerWebhook(
      makeRequest("http://localhost/api/trigger/WEBHOOK_ID", {
        method: "POST",
        headers: { "x-webhook-secret": BASE_WEBHOOK.secret, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Scheduled post", scheduledAt: futureDate }),
      }),
      { params }
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("SCHEDULED");
    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SCHEDULED",
          scheduledAt: expect.any(Date),
        }),
      })
    );
  });

  it("returns 422 when no content can be extracted", async () => {
    mockFindUnique.mockResolvedValue(BASE_WEBHOOK);
    mockTimingSafeEqual.mockReturnValue(true);
    mockLogCreate.mockResolvedValue({});

    const res = await triggerWebhook(
      makeRequest("http://localhost/api/trigger/WEBHOOK_ID", {
        method: "POST",
        headers: { "x-webhook-secret": BASE_WEBHOOK.secret, "Content-Type": "application/json" },
        body: JSON.stringify({ unrelated: "data" }),
      }),
      { params }
    );

    expect(res.status).toBe(422);
  });

  it("increments triggerCount on successful trigger", async () => {
    mockFindUnique.mockResolvedValue(BASE_WEBHOOK);
    mockTimingSafeEqual.mockReturnValue(true);
    mockPostCreate.mockResolvedValue({ id: "p1", status: "DRAFT" });
    mockLogCreate.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

    await triggerWebhook(
      makeRequest("http://localhost/api/trigger/WEBHOOK_ID", {
        method: "POST",
        headers: { "x-webhook-secret": BASE_WEBHOOK.secret, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "test" }),
      }),
      { params }
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          triggerCount: { increment: 1 },
        }),
      })
    );
  });
});
