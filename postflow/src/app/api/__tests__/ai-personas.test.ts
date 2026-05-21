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
    aiPersona: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listPersonas, POST as createPersona } from "@/app/api/ai-personas/route";
import {
  PATCH as updatePersona,
  DELETE as deletePersona,
} from "@/app/api/ai-personas/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.aiPersona.findMany as jest.Mock;
const mockFindFirst = prisma.aiPersona.findFirst as jest.Mock;
const mockCreate = prisma.aiPersona.create as jest.Mock;
const mockCount = prisma.aiPersona.count as jest.Mock;
const mockUpdate = prisma.aiPersona.update as jest.Mock;
const mockDelete = prisma.aiPersona.delete as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const PERSONA_ID = "clh3ck8zp0001qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_PERSONA = {
  id: PERSONA_ID,
  userId: MOCK_USER_ID,
  name: "Brand Voice",
  description: "Our core brand voice",
  writingStyle: "Professional, concise, uses data",
  tone: "professional",
  audienceDescription: "B2B marketers",
  exampleContent: "Check out our latest report…",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/ai-personas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/ai-personas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/ai-personas/${id}`, {
    method: "DELETE",
  });
}

function makeParams(id: string) {
  return Promise.resolve({ id });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/ai-personas ──────────────────────────────────────────────────────

describe("GET /api/ai-personas", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listPersonas();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await listPersonas();
    expect(res.status).toBe(429);
  });

  it("returns list of personas", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValue([BASE_PERSONA]);

    const res = await listPersonas();
    const data = (await res.json()) as { personas: typeof BASE_PERSONA[] };

    expect(res.status).toBe(200);
    expect(data.personas).toHaveLength(1);
    expect(data.personas[0].name).toBe("Brand Voice");
    expect(data.personas[0].writingStyle).toBe("Professional, concise, uses data");
  });

  it("returns empty array when no personas", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValue([]);

    const res = await listPersonas();
    const data = (await res.json()) as { personas: unknown[] };
    expect(data.personas).toHaveLength(0);
  });
});

// ── POST /api/ai-personas ─────────────────────────────────────────────────────

describe("POST /api/ai-personas", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await createPersona(makePostRequest({ name: "Test", writingStyle: "Casual", tone: "casual" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await createPersona(makePostRequest({ name: "Test", writingStyle: "Casual", tone: "casual" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    const res = await createPersona(makePostRequest({ writingStyle: "Casual", tone: "casual" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when writingStyle is missing", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    const res = await createPersona(makePostRequest({ name: "Test", tone: "casual" }));
    expect(res.status).toBe(400);
  });

  it("returns 422 when max personas reached", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockCount.mockResolvedValue(10);
    const res = await createPersona(
      makePostRequest({ name: "Test", writingStyle: "Casual", tone: "casual" })
    );
    expect(res.status).toBe(422);
  });

  it("creates a persona and returns 201", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue(BASE_PERSONA);

    const res = await createPersona(
      makePostRequest({
        name: "Brand Voice",
        description: "Our core brand voice",
        writingStyle: "Professional, concise, uses data",
        tone: "professional",
        audienceDescription: "B2B marketers",
        exampleContent: "Check out our latest report…",
      })
    );
    const data = (await res.json()) as { persona: typeof BASE_PERSONA };

    expect(res.status).toBe(201);
    expect(data.persona.name).toBe("Brand Voice");
    expect(data.persona.tone).toBe("professional");
  });

  it("returns 400 for invalid JSON", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/ai-personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await createPersona(req);
    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/ai-personas/[id] ───────────────────────────────────────────────

describe("PATCH /api/ai-personas/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await updatePersona(makePatchRequest(PERSONA_ID, { name: "New Name" }), {
      params: makeParams(PERSONA_ID),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when persona not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValue(null);
    const res = await updatePersona(makePatchRequest(PERSONA_ID, { name: "New Name" }), {
      params: makeParams(PERSONA_ID),
    });
    expect(res.status).toBe(404);
  });

  it("updates a persona and returns updated data", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValue(BASE_PERSONA);
    mockUpdate.mockResolvedValue({ ...BASE_PERSONA, name: "Updated Voice" });

    const res = await updatePersona(makePatchRequest(PERSONA_ID, { name: "Updated Voice" }), {
      params: makeParams(PERSONA_ID),
    });
    const data = (await res.json()) as { persona: typeof BASE_PERSONA };

    expect(res.status).toBe(200);
    expect(data.persona.name).toBe("Updated Voice");
  });
});

// ── DELETE /api/ai-personas/[id] ──────────────────────────────────────────────

describe("DELETE /api/ai-personas/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await deletePersona(makeDeleteRequest(PERSONA_ID), {
      params: makeParams(PERSONA_ID),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await deletePersona(makeDeleteRequest(PERSONA_ID), {
      params: makeParams(PERSONA_ID),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when persona not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValue(null);
    const res = await deletePersona(makeDeleteRequest(PERSONA_ID), {
      params: makeParams(PERSONA_ID),
    });
    expect(res.status).toBe(404);
  });

  it("deletes persona and returns success", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValue(BASE_PERSONA);
    mockDelete.mockResolvedValue(BASE_PERSONA);

    const res = await deletePersona(makeDeleteRequest(PERSONA_ID), {
      params: makeParams(PERSONA_ID),
    });
    const data = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("only deletes persona owned by current user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindFirst.mockResolvedValue(null); // findFirst with userId filter finds nothing

    const res = await deletePersona(makeDeleteRequest(PERSONA_ID), {
      params: makeParams(PERSONA_ID),
    });
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
