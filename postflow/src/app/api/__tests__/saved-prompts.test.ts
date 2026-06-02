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
    savedPrompt: {
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
import { GET as listPrompts, POST as createPrompt } from "@/app/api/saved-prompts/route";
import { GET as listCommunity } from "@/app/api/saved-prompts/community/route";
import {
  PATCH as updatePrompt,
  DELETE as deletePrompt,
} from "@/app/api/saved-prompts/[id]/route";
import { POST as usePrompt } from "@/app/api/saved-prompts/[id]/use/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.savedPrompt.findMany as jest.Mock;
const mockFindUnique = prisma.savedPrompt.findUnique as jest.Mock;
const mockCreate = prisma.savedPrompt.create as jest.Mock;
const mockCount = prisma.savedPrompt.count as jest.Mock;
const mockUpdate = prisma.savedPrompt.update as jest.Mock;
const mockDelete = prisma.savedPrompt.delete as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const PROMPT_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";

const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_PROMPT = {
  id: PROMPT_ID,
  userId: MOCK_USER_ID,
  name: "Engaging Hook",
  description: "Generates an engaging opening line",
  prompt: "Write a compelling hook for a post about {topic}",
  category: "Hooks",
  isPublic: false,
  usageCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PUBLIC_PROMPT = {
  ...BASE_PROMPT,
  id: "clh3ck8zp0003qr5hyvxckahk",
  isPublic: true,
  usageCount: 42,
};

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/saved-prompts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/saved-prompts/${id}`, {
    method: "DELETE",
  });
}

function makeUseRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/saved-prompts/${id}/use`, {
    method: "POST",
  });
}

function makeParams(id: string) {
  return Promise.resolve({ id });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/saved-prompts ────────────────────────────────────────────────────

describe("GET /api/saved-prompts", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listPrompts();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await listPrompts();
    expect(res.status).toBe(429);
  });

  it("returns list of user prompts", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValue([BASE_PROMPT]);

    const res = await listPrompts();
    const data = (await res.json()) as { prompts: typeof BASE_PROMPT[] };

    expect(res.status).toBe(200);
    expect(data.prompts).toHaveLength(1);
    expect(data.prompts[0].name).toBe("Engaging Hook");
    expect(data.prompts[0].prompt).toBe("Write a compelling hook for a post about {topic}");
    expect(data.prompts[0].isPublic).toBe(false);
  });

  it("returns empty array when no prompts", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValue([]);

    const res = await listPrompts();
    const data = (await res.json()) as { prompts: unknown[] };
    expect(data.prompts).toHaveLength(0);
  });
});

// ── POST /api/saved-prompts ───────────────────────────────────────────────────

describe("POST /api/saved-prompts", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await createPrompt(
      makePostRequest("http://localhost:3000/api/saved-prompts", { name: "Test", prompt: "Test prompt" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await createPrompt(
      makePostRequest("http://localhost:3000/api/saved-prompts", { name: "Test", prompt: "Test prompt" })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    const res = await createPrompt(
      makePostRequest("http://localhost:3000/api/saved-prompts", { prompt: "Test prompt" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when prompt is missing", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    const res = await createPrompt(
      makePostRequest("http://localhost:3000/api/saved-prompts", { name: "Test" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when max prompts reached", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockCount.mockResolvedValue(50);
    const res = await createPrompt(
      makePostRequest("http://localhost:3000/api/saved-prompts", { name: "Test", prompt: "Test prompt" })
    );
    expect(res.status).toBe(422);
  });

  it("creates a prompt and returns 201", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue(BASE_PROMPT);

    const res = await createPrompt(
      makePostRequest("http://localhost:3000/api/saved-prompts", {
        name: "Engaging Hook",
        description: "Generates an engaging opening line",
        prompt: "Write a compelling hook for a post about {topic}",
        category: "Hooks",
        isPublic: false,
      })
    );
    const data = (await res.json()) as { savedPrompt: typeof BASE_PROMPT };

    expect(res.status).toBe(201);
    expect(data.savedPrompt.name).toBe("Engaging Hook");
    expect(data.savedPrompt.usageCount).toBe(0);
  });

  it("creates a public prompt when isPublic is true", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue({ ...BASE_PROMPT, isPublic: true });

    const res = await createPrompt(
      makePostRequest("http://localhost:3000/api/saved-prompts", {
        name: "Public Prompt",
        prompt: "Write a post about sustainability",
        isPublic: true,
      })
    );
    const data = (await res.json()) as { savedPrompt: typeof BASE_PROMPT };

    expect(res.status).toBe(201);
    expect(data.savedPrompt.isPublic).toBe(true);
  });
});

// ── GET /api/saved-prompts/community ─────────────────────────────────────────

describe("GET /api/saved-prompts/community", () => {
  it("returns public prompts without authentication", async () => {
    mockFindMany.mockResolvedValue([PUBLIC_PROMPT]);

    const req = new NextRequest("http://localhost:3000/api/saved-prompts/community");
    const res = await listCommunity(req);
    const data = (await res.json()) as { prompts: typeof PUBLIC_PROMPT[] };

    expect(res.status).toBe(200);
    expect(data.prompts).toHaveLength(1);
    expect(data.prompts[0].usageCount).toBe(42);
    expect(data.prompts[0].isPublic).toBeUndefined(); // isPublic not exposed in community
  });

  it("returns empty array when no public prompts", async () => {
    mockFindMany.mockResolvedValue([]);

    const req = new NextRequest("http://localhost:3000/api/saved-prompts/community");
    const res = await listCommunity(req);
    const data = (await res.json()) as { prompts: unknown[] };

    expect(res.status).toBe(200);
    expect(data.prompts).toHaveLength(0);
  });
});

// ── PATCH /api/saved-prompts/[id] ────────────────────────────────────────────

describe("PATCH /api/saved-prompts/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await updatePrompt(makePatchRequest(PROMPT_ID, { name: "Updated" }), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await updatePrompt(makePatchRequest(PROMPT_ID, { name: "Updated" }), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when prompt not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValue(null);
    const res = await updatePrompt(makePatchRequest(PROMPT_ID, { name: "Updated" }), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when prompt belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValue({ ...BASE_PROMPT, userId: OTHER_USER_ID });
    const res = await updatePrompt(makePatchRequest(PROMPT_ID, { name: "Updated" }), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(404);
  });

  it("updates prompt and returns updated data", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValue(BASE_PROMPT);
    mockUpdate.mockResolvedValue({ ...BASE_PROMPT, name: "Updated Hook", isPublic: true });

    const res = await updatePrompt(
      makePatchRequest(PROMPT_ID, { name: "Updated Hook", isPublic: true }),
      { params: makeParams(PROMPT_ID) }
    );
    const data = (await res.json()) as { savedPrompt: typeof BASE_PROMPT };

    expect(res.status).toBe(200);
    expect(data.savedPrompt.name).toBe("Updated Hook");
    expect(data.savedPrompt.isPublic).toBe(true);
  });
});

// ── DELETE /api/saved-prompts/[id] ───────────────────────────────────────────

describe("DELETE /api/saved-prompts/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await deletePrompt(makeDeleteRequest(PROMPT_ID), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await deletePrompt(makeDeleteRequest(PROMPT_ID), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when prompt not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValue(null);
    const res = await deletePrompt(makeDeleteRequest(PROMPT_ID), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when prompt belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValue({ ...BASE_PROMPT, userId: OTHER_USER_ID });
    const res = await deletePrompt(makeDeleteRequest(PROMPT_ID), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(404);
  });

  it("deletes prompt and returns success", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValue(BASE_PROMPT);
    mockDelete.mockResolvedValue(BASE_PROMPT);

    const res = await deletePrompt(makeDeleteRequest(PROMPT_ID), { params: makeParams(PROMPT_ID) });
    const data = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: PROMPT_ID } });
  });
});

// ── POST /api/saved-prompts/[id]/use ─────────────────────────────────────────

describe("POST /api/saved-prompts/[id]/use", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await usePrompt(makeUseRequest(PROMPT_ID), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await usePrompt(makeUseRequest(PROMPT_ID), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when prompt not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValue(null);
    const res = await usePrompt(makeUseRequest(PROMPT_ID), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when prompt is private and belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValue({ ...BASE_PROMPT, userId: OTHER_USER_ID, isPublic: false });
    const res = await usePrompt(makeUseRequest(PROMPT_ID), { params: makeParams(PROMPT_ID) });
    expect(res.status).toBe(404);
  });

  it("increments usageCount for own prompt and returns updated count", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValue(BASE_PROMPT);
    mockUpdate.mockResolvedValue({ usageCount: 1 });

    const res = await usePrompt(makeUseRequest(PROMPT_ID), { params: makeParams(PROMPT_ID) });
    const data = (await res.json()) as { usageCount: number };

    expect(res.status).toBe(200);
    expect(data.usageCount).toBe(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { usageCount: { increment: 1 } } })
    );
  });

  it("allows incrementing a public prompt from another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    // Prompt belongs to OTHER_USER_ID but is public
    mockFindUnique.mockResolvedValue({ ...PUBLIC_PROMPT, userId: OTHER_USER_ID });
    mockUpdate.mockResolvedValue({ usageCount: 43 });

    const res = await usePrompt(makeUseRequest(PUBLIC_PROMPT.id), { params: makeParams(PUBLIC_PROMPT.id) });
    const data = (await res.json()) as { usageCount: number };

    expect(res.status).toBe(200);
    expect(data.usageCount).toBe(43);
  });
});
