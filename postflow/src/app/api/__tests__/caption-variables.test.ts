jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
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
    captionVariable: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listVars, POST as createVar } from "@/app/api/caption-variables/route";
import { PATCH as updateVar, DELETE as deleteVar } from "@/app/api/caption-variables/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.captionVariable.findMany as jest.Mock;
const mockFindUnique = prisma.captionVariable.findUnique as jest.Mock;
const mockCreate = prisma.captionVariable.create as jest.Mock;
const mockCount = prisma.captionVariable.count as jest.Mock;
const mockUpdate = prisma.captionVariable.update as jest.Mock;
const mockDelete = prisma.captionVariable.delete as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const VAR_ID = "clh3ck8zp0001qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_VAR = {
  id: VAR_ID,
  userId: MOCK_USER_ID,
  key: "brand_name",
  value: "PostFlow",
  description: "The brand name",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/caption-variables", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/caption-variables/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/caption-variables/${id}`, {
    method: "DELETE",
  });
}

function makeParams(id: string) {
  return Promise.resolve({ id });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
});

// ── GET /api/caption-variables ────────────────────────────────────────────────

describe("GET /api/caption-variables", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listVars();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await listVars();
    expect(res.status).toBe(429);
  });

  it("returns empty variables list", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await listVars();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { variables: unknown[] };
    expect(body.variables).toEqual([]);
  });

  it("returns variables for the current user", async () => {
    mockFindMany.mockResolvedValue([BASE_VAR]);
    const res = await listVars();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { variables: typeof BASE_VAR[] };
    expect(body.variables).toHaveLength(1);
    expect(body.variables[0].key).toBe("brand_name");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });
});

// ── POST /api/caption-variables ───────────────────────────────────────────────

describe("POST /api/caption-variables", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await createVar(makePostRequest({ key: "x", value: "y" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await createVar(makePostRequest({ key: "x", value: "y" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for missing value", async () => {
    const res = await createVar(makePostRequest({ key: "brand_name" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty key", async () => {
    const res = await createVar(makePostRequest({ key: "", value: "PostFlow" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for key with invalid characters", async () => {
    const res = await createVar(makePostRequest({ key: "brand-name", value: "PostFlow" }));
    expect(res.status).toBe(400);
  });

  it("returns 422 when max variables reached", async () => {
    mockCount.mockResolvedValue(50);
    const res = await createVar(makePostRequest({ key: "brand_name", value: "PostFlow" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("50");
  });

  it("returns 409 for duplicate key", async () => {
    mockCount.mockResolvedValue(0);
    const p2002 = new Error("Unique constraint failed") as Error & { code: string };
    p2002.code = "P2002";
    mockCreate.mockRejectedValue(p2002);
    const res = await createVar(makePostRequest({ key: "brand_name", value: "PostFlow" }));
    expect(res.status).toBe(409);
  });

  it("creates a variable successfully", async () => {
    mockCount.mockResolvedValue(3);
    mockCreate.mockResolvedValue(BASE_VAR);
    const res = await createVar(
      makePostRequest({ key: "brand_name", value: "PostFlow", description: "The brand name" })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { variable: typeof BASE_VAR };
    expect(body.variable.key).toBe("brand_name");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_USER_ID,
          key: "brand_name",
          value: "PostFlow",
        }),
      })
    );
  });

  it("creates a variable without description", async () => {
    mockCount.mockResolvedValue(0);
    const noDesc = { ...BASE_VAR, description: null };
    mockCreate.mockResolvedValue(noDesc);
    const res = await createVar(makePostRequest({ key: "brand_name", value: "PostFlow" }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: null }),
      })
    );
  });
});

// ── PATCH /api/caption-variables/[id] ────────────────────────────────────────

describe("PATCH /api/caption-variables/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await updateVar(makePatchRequest(VAR_ID, { value: "x" }), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await updateVar(makePatchRequest(VAR_ID, { value: "x" }), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when variable not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await updateVar(makePatchRequest(VAR_ID, { value: "x" }), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when variable belongs to another user", async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_VAR, userId: OTHER_USER_ID });
    const res = await updateVar(makePatchRequest(VAR_ID, { value: "x" }), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid key format", async () => {
    mockFindUnique.mockResolvedValue(BASE_VAR);
    const res = await updateVar(makePatchRequest(VAR_ID, { key: "has-dash" }), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(400);
  });

  it("updates variable value successfully", async () => {
    mockFindUnique.mockResolvedValue(BASE_VAR);
    const updated = { ...BASE_VAR, value: "NewFlow" };
    mockUpdate.mockResolvedValue(updated);
    const res = await updateVar(makePatchRequest(VAR_ID, { value: "NewFlow" }), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { variable: typeof updated };
    expect(body.variable.value).toBe("NewFlow");
  });

  it("returns 409 when updating to a duplicate key", async () => {
    mockFindUnique.mockResolvedValue(BASE_VAR);
    const p2002 = new Error("Unique constraint failed") as Error & { code: string };
    p2002.code = "P2002";
    mockUpdate.mockRejectedValue(p2002);
    const res = await updateVar(makePatchRequest(VAR_ID, { key: "existing_key" }), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(409);
  });
});

// ── DELETE /api/caption-variables/[id] ───────────────────────────────────────

describe("DELETE /api/caption-variables/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await deleteVar(makeDeleteRequest(VAR_ID), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await deleteVar(makeDeleteRequest(VAR_ID), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when variable not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await deleteVar(makeDeleteRequest(VAR_ID), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when variable belongs to another user", async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_VAR, userId: OTHER_USER_ID });
    const res = await deleteVar(makeDeleteRequest(VAR_ID), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(404);
  });

  it("deletes variable successfully", async () => {
    mockFindUnique.mockResolvedValue(BASE_VAR);
    mockDelete.mockResolvedValue(BASE_VAR);
    const res = await deleteVar(makeDeleteRequest(VAR_ID), {
      params: makeParams(VAR_ID),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: VAR_ID } });
  });
});
