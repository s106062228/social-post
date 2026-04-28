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
    apiKey: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listKeys, POST as createKey } from "@/app/api/api-keys/route";
import { DELETE as deleteKey } from "@/app/api/api-keys/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.apiKey.findMany as jest.Mock;
const mockFindUnique = prisma.apiKey.findUnique as jest.Mock;
const mockCount = prisma.apiKey.count as jest.Mock;
const mockCreate = prisma.apiKey.create as jest.Mock;
const mockDelete = prisma.apiKey.delete as jest.Mock;

const USER_ID = "cluser0001";
const OTHER_ID = "cluser9999";
const KEY_ID = "clapikey001";
const AUTHED_SESSION = { user: { id: USER_ID, email: "user@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_KEY = {
  id: KEY_ID,
  userId: USER_ID,
  name: "My CI Key",
  prefix: "pf_abcdef1234",
  keyHash: "deadbeef".repeat(8),
  lastUsedAt: null,
  expiresAt: null,
  createdAt: new Date(),
};

function makeRequest(method = "GET", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/api-keys", {
    method,
    ...(body
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}

function makeIdRequest(method = "DELETE"): NextRequest {
  return new NextRequest(`http://localhost/api/api-keys/${KEY_ID}`, { method });
}

const MOCK_PARAMS = Promise.resolve({ id: KEY_ID });
const SHORT_ID_PARAMS = Promise.resolve({ id: "short" });

beforeEach(() => jest.clearAllMocks());

// ── GET /api/api-keys ──────────────────────────────────────────────────────────

describe("GET /api/api-keys", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listKeys();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);
    const res = await listKeys();
    expect(res.status).toBe(429);
  });

  it("returns empty keys list when user has no keys", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await listKeys();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { keys: typeof BASE_KEY[] };
    expect(data.keys).toHaveLength(0);
  });

  it("returns keys list on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const keyView = {
      id: BASE_KEY.id,
      name: BASE_KEY.name,
      prefix: BASE_KEY.prefix,
      lastUsedAt: BASE_KEY.lastUsedAt,
      expiresAt: BASE_KEY.expiresAt,
      createdAt: BASE_KEY.createdAt,
    };
    mockFindMany.mockResolvedValueOnce([keyView]);

    const res = await listKeys();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { keys: typeof keyView[] };
    expect(data.keys).toHaveLength(1);
    expect(data.keys[0].id).toBe(KEY_ID);
    // keyHash must never be in the response
    expect((data.keys[0] as Record<string, unknown>).keyHash).toBeUndefined();
  });
});

// ── POST /api/api-keys ─────────────────────────────────────────────────────────

describe("POST /api/api-keys", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createKey(makeRequest("POST", { name: "test" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);
    const res = await createKey(makeRequest("POST", { name: "test" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const req = new NextRequest("http://localhost/api/api-keys", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await createKey(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createKey(makeRequest("POST", {}));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { issues: Record<string, string[]> };
    expect(data.issues.name).toBeDefined();
  });

  it("returns 400 when name is empty string", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createKey(makeRequest("POST", { name: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when user has reached max keys limit", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockCount.mockResolvedValueOnce(10);

    const res = await createKey(makeRequest("POST", { name: "Key 11" }));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("Maximum");
  });

  it("returns 201 with key metadata and raw key on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce({
      id: KEY_ID,
      name: "CI Key",
      prefix: "pf_abc12345",
      expiresAt: null,
      createdAt: new Date(),
    });

    const res = await createKey(makeRequest("POST", { name: "CI Key" }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      id: string;
      name: string;
      prefix: string;
      key: string;
    };
    expect(data.id).toBe(KEY_ID);
    expect(data.key).toBeDefined();
    expect(data.key).toMatch(/^pf_/);
  });

  it("passes expiresAt to prisma when provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce({
      id: KEY_ID,
      name: "Expiring Key",
      prefix: "pf_xyzabc",
      expiresAt: new Date("2027-01-01"),
      createdAt: new Date(),
    });

    const expiresAt = "2027-01-01T00:00:00.000Z";
    const res = await createKey(makeRequest("POST", { name: "Expiring Key", expiresAt }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresAt: new Date(expiresAt) }),
      })
    );
  });
});

// ── DELETE /api/api-keys/[id] ─────────────────────────────────────────────────

describe("DELETE /api/api-keys/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteKey(makeIdRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);
    const res = await deleteKey(makeIdRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(429);
  });

  it("returns 404 for short id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await deleteKey(makeIdRequest(), { params: SHORT_ID_PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 404 when key does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await deleteKey(makeIdRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 404 when key belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_KEY, userId: OTHER_ID });
    const res = await deleteKey(makeIdRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful delete", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_KEY);
    mockDelete.mockResolvedValueOnce(BASE_KEY);
    const res = await deleteKey(makeIdRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(204);
  });
});
