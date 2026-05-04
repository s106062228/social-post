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
    contentSnippet: {
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
import { GET as listSnippets, POST as createSnippet } from "@/app/api/snippets/route";
import { PATCH as updateSnippet, DELETE as deleteSnippet } from "@/app/api/snippets/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.contentSnippet.findMany as jest.Mock;
const mockFindUnique = prisma.contentSnippet.findUnique as jest.Mock;
const mockCreate = prisma.contentSnippet.create as jest.Mock;
const mockCount = prisma.contentSnippet.count as jest.Mock;
const mockUpdate = prisma.contentSnippet.update as jest.Mock;
const mockDelete = prisma.contentSnippet.delete as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const SNIPPET_ID = "clh3ck8zp0001qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_SNIPPET = {
  id: SNIPPET_ID,
  userId: MOCK_USER_ID,
  name: "My CTA",
  content: "Follow us for more tips!",
  category: "CTA",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/snippets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/snippets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/snippets/${id}`, {
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

// ── GET /api/snippets ─────────────────────────────────────────────────────────

describe("GET /api/snippets", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listSnippets();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await listSnippets();
    expect(res.status).toBe(429);
  });

  it("returns empty snippets list", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await listSnippets();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { snippets: unknown[] };
    expect(body.snippets).toEqual([]);
  });

  it("returns snippets for the current user", async () => {
    mockFindMany.mockResolvedValue([BASE_SNIPPET]);
    const res = await listSnippets();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { snippets: typeof BASE_SNIPPET[] };
    expect(body.snippets).toHaveLength(1);
    expect(body.snippets[0].name).toBe("My CTA");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });
});

// ── POST /api/snippets ────────────────────────────────────────────────────────

describe("POST /api/snippets", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await createSnippet(makePostRequest({ name: "x", content: "y" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await createSnippet(makePostRequest({ name: "x", content: "y" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid input (missing content)", async () => {
    const res = await createSnippet(makePostRequest({ name: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty name", async () => {
    const res = await createSnippet(makePostRequest({ name: "", content: "test" }));
    expect(res.status).toBe(400);
  });

  it("returns 422 when max snippets reached", async () => {
    mockCount.mockResolvedValue(50);
    const res = await createSnippet(
      makePostRequest({ name: "New", content: "Content" })
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("50");
  });

  it("creates a snippet successfully", async () => {
    mockCount.mockResolvedValue(3);
    mockCreate.mockResolvedValue(BASE_SNIPPET);
    const res = await createSnippet(
      makePostRequest({ name: "My CTA", content: "Follow us!", category: "CTA" })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { snippet: typeof BASE_SNIPPET };
    expect(body.snippet.name).toBe("My CTA");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_USER_ID,
          name: "My CTA",
          content: "Follow us!",
          category: "CTA",
        }),
      })
    );
  });

  it("creates a snippet without category", async () => {
    mockCount.mockResolvedValue(0);
    const snippetNoCategory = { ...BASE_SNIPPET, category: null };
    mockCreate.mockResolvedValue(snippetNoCategory);
    const res = await createSnippet(
      makePostRequest({ name: "Signature", content: "— PostFlow Team" })
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: null }),
      })
    );
  });
});

// ── PATCH /api/snippets/[id] ──────────────────────────────────────────────────

describe("PATCH /api/snippets/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await updateSnippet(makePatchRequest(SNIPPET_ID, { name: "x" }), {
      params: makeParams(SNIPPET_ID),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when snippet not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await updateSnippet(makePatchRequest(SNIPPET_ID, { name: "x" }), {
      params: makeParams(SNIPPET_ID),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when snippet belongs to another user", async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_SNIPPET, userId: OTHER_USER_ID });
    const res = await updateSnippet(makePatchRequest(SNIPPET_ID, { name: "x" }), {
      params: makeParams(SNIPPET_ID),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid input", async () => {
    mockFindUnique.mockResolvedValue(BASE_SNIPPET);
    const res = await updateSnippet(makePatchRequest(SNIPPET_ID, { name: "" }), {
      params: makeParams(SNIPPET_ID),
    });
    expect(res.status).toBe(400);
  });

  it("updates snippet successfully", async () => {
    mockFindUnique.mockResolvedValue(BASE_SNIPPET);
    const updated = { ...BASE_SNIPPET, name: "Updated CTA" };
    mockUpdate.mockResolvedValue(updated);
    const res = await updateSnippet(
      makePatchRequest(SNIPPET_ID, { name: "Updated CTA" }),
      { params: makeParams(SNIPPET_ID) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { snippet: typeof updated };
    expect(body.snippet.name).toBe("Updated CTA");
  });
});

// ── DELETE /api/snippets/[id] ─────────────────────────────────────────────────

describe("DELETE /api/snippets/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await deleteSnippet(makeDeleteRequest(SNIPPET_ID), {
      params: makeParams(SNIPPET_ID),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await deleteSnippet(makeDeleteRequest(SNIPPET_ID), {
      params: makeParams(SNIPPET_ID),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when snippet not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await deleteSnippet(makeDeleteRequest(SNIPPET_ID), {
      params: makeParams(SNIPPET_ID),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when snippet belongs to another user", async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_SNIPPET, userId: OTHER_USER_ID });
    const res = await deleteSnippet(makeDeleteRequest(SNIPPET_ID), {
      params: makeParams(SNIPPET_ID),
    });
    expect(res.status).toBe(404);
  });

  it("deletes snippet successfully", async () => {
    mockFindUnique.mockResolvedValue(BASE_SNIPPET);
    mockDelete.mockResolvedValue(BASE_SNIPPET);
    const res = await deleteSnippet(makeDeleteRequest(SNIPPET_ID), {
      params: makeParams(SNIPPET_ID),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: SNIPPET_ID } });
  });
});
