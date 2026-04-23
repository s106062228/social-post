jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
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
    webhookConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// Mock crypto.randomBytes so we get a predictable secret
jest.mock("crypto", () => {
  const actual = jest.requireActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    randomBytes: jest.fn().mockReturnValue(Buffer.from("a".repeat(32))),
  };
});

import { NextRequest } from "next/server";
import { GET as listConfigs, POST as createConfig } from "@/app/api/webhook-configs/route";
import { DELETE as deleteConfig } from "@/app/api/webhook-configs/[id]/route";
import { PATCH as toggleConfig } from "@/app/api/webhook-configs/[id]/toggle/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.webhookConfig.findMany as jest.Mock;
const mockFindUnique = prisma.webhookConfig.findUnique as jest.Mock;
const mockCreate = prisma.webhookConfig.create as jest.Mock;
const mockUpdate = prisma.webhookConfig.update as jest.Mock;
const mockDelete = prisma.webhookConfig.delete as jest.Mock;

const USER_ID = "cluser0001";
const OTHER_ID = "cluser9999";
const WEBHOOK_ID = "clwebhook001";
const AUTHED_SESSION = { user: { id: USER_ID, email: "user@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_CONFIG = {
  id: WEBHOOK_ID,
  userId: USER_ID,
  url: "https://example.com/hook",
  events: ["post.published", "post.failed"],
  isActive: true,
  secret: "secret123",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(method = "GET", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/webhook-configs", {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

function makeIdRequest(method = "DELETE"): NextRequest {
  return new NextRequest(`http://localhost/api/webhook-configs/${WEBHOOK_ID}`, { method });
}

const MOCK_PARAMS = Promise.resolve({ id: WEBHOOK_ID });
const SHORT_ID_PARAMS = Promise.resolve({ id: "short" });

beforeEach(() => jest.clearAllMocks());

// ── GET /api/webhook-configs ──────────────────────────────────────────────────

describe("GET /api/webhook-configs", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listConfigs();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);
    const res = await listConfigs();
    expect(res.status).toBe(429);
  });

  it("returns configs list and validEvents on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([BASE_CONFIG]);

    const res = await listConfigs();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { configs: typeof BASE_CONFIG[]; validEvents: string[] };
    expect(data.configs).toHaveLength(1);
    expect(data.configs[0].id).toBe(WEBHOOK_ID);
    expect(Array.isArray(data.validEvents)).toBe(true);
    expect(data.validEvents).toContain("post.published");
  });
});

// ── POST /api/webhook-configs ─────────────────────────────────────────────────

describe("POST /api/webhook-configs", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createConfig(makeRequest("POST", { url: "https://x.com", events: ["post.published"] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const req = new NextRequest("http://localhost/api/webhook-configs", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await createConfig(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when URL is not HTTPS", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createConfig(
      makeRequest("POST", { url: "http://insecure.com/hook", events: ["post.published"] })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { issues: Record<string, string[]> };
    expect(data.issues.url).toBeDefined();
  });

  it("returns 400 when events array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createConfig(
      makeRequest("POST", { url: "https://x.com/hook", events: [] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 201 with created config including secret on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockCreate.mockResolvedValueOnce({ ...BASE_CONFIG, secret: "a".repeat(64) });

    const res = await createConfig(
      makeRequest("POST", { url: "https://example.com/hook", events: ["post.published"] })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_CONFIG & { secret: string };
    expect(data.id).toBe(WEBHOOK_ID);
    expect(data.secret).toBeDefined();
  });
});

// ── DELETE /api/webhook-configs/[id] ─────────────────────────────────────────

describe("DELETE /api/webhook-configs/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteConfig(makeIdRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 404 for short id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await deleteConfig(makeIdRequest(), { params: SHORT_ID_PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 404 when config belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_CONFIG, userId: OTHER_ID });
    const res = await deleteConfig(makeIdRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful delete", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_CONFIG);
    mockDelete.mockResolvedValueOnce(BASE_CONFIG);
    const res = await deleteConfig(makeIdRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(204);
  });
});

// ── PATCH /api/webhook-configs/[id]/toggle ────────────────────────────────────

describe("PATCH /api/webhook-configs/[id]/toggle", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await toggleConfig(makeIdRequest("PATCH"), { params: MOCK_PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown config", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await toggleConfig(makeIdRequest("PATCH"), { params: MOCK_PARAMS });
    expect(res.status).toBe(404);
  });

  it("toggles isActive from true to false", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_CONFIG, isActive: true });
    mockUpdate.mockResolvedValueOnce({ ...BASE_CONFIG, isActive: false });

    const res = await toggleConfig(makeIdRequest("PATCH"), { params: MOCK_PARAMS });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isActive: boolean };
    expect(data.isActive).toBe(false);
  });

  it("toggles isActive from false to true", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_CONFIG, isActive: false });
    mockUpdate.mockResolvedValueOnce({ ...BASE_CONFIG, isActive: true });

    const res = await toggleConfig(makeIdRequest("PATCH"), { params: MOCK_PARAMS });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isActive: boolean };
    expect(data.isActive).toBe(true);
  });
});
