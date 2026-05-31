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
    audiencePersona: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listPersonas, POST as createPersona } from "@/app/api/audience-personas/route";
import {
  PATCH as updatePersona,
  DELETE as deletePersona,
} from "@/app/api/audience-personas/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPersonaFindMany = prisma.audiencePersona.findMany as jest.Mock;
const mockPersonaFindUnique = prisma.audiencePersona.findUnique as jest.Mock;
const mockPersonaCreate = prisma.audiencePersona.create as jest.Mock;
const mockPersonaUpdate = prisma.audiencePersona.update as jest.Mock;
const mockPersonaCount = prisma.audiencePersona.count as jest.Mock;
const mockPersonaDelete = prisma.audiencePersona.delete as jest.Mock;

const SESSION = { user: { id: "user-1", email: "test@example.com" } };
const RATE_OK = { success: true };
const RATE_FAIL = { success: false };

const SAMPLE_PERSONA = {
  id: "persona-1",
  userId: "user-1",
  name: "Marketing Manager",
  description: "A marketing professional",
  ageRange: "25-34",
  primaryPlatforms: ["LinkedIn", "Twitter"],
  interests: ["SaaS", "Growth"],
  painPoints: ["Time management"],
  goals: ["Increase ROI"],
  contentTypes: ["Educational", "Promotional"],
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(method: string, body?: unknown, params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/audience-personas" + (params?.id ? `/${params.id}` : ""));
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockApiLimiter.mockResolvedValue(RATE_OK);
});

// ── GET /api/audience-personas ─────────────────────────────────────────────────

describe("GET /api/audience-personas", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listPersonas();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_FAIL);
    const res = await listPersonas();
    expect(res.status).toBe(429);
  });

  it("returns empty array when no personas exist", async () => {
    mockPersonaFindMany.mockResolvedValue([]);
    const res = await listPersonas();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.personas).toEqual([]);
  });

  it("returns list of personas", async () => {
    mockPersonaFindMany.mockResolvedValue([SAMPLE_PERSONA]);
    const res = await listPersonas();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.personas).toHaveLength(1);
    expect(data.personas[0].name).toBe("Marketing Manager");
  });
});

// ── POST /api/audience-personas ────────────────────────────────────────────────

describe("POST /api/audience-personas", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest("POST", { name: "Test" });
    const res = await createPersona(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_FAIL);
    const req = makeRequest("POST", { name: "Test" });
    const res = await createPersona(req);
    expect(res.status).toBe(429);
  });

  it("returns 400 when at max limit", async () => {
    mockPersonaCount.mockResolvedValue(20);
    const req = makeRequest("POST", { name: "Test" });
    const res = await createPersona(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Maximum 20");
  });

  it("returns 400 for invalid body", async () => {
    mockPersonaCount.mockResolvedValue(0);
    const req = makeRequest("POST", { name: "" }); // empty name fails min(1)
    const res = await createPersona(req);
    expect(res.status).toBe(400);
  });

  it("creates a persona and returns 201", async () => {
    mockPersonaCount.mockResolvedValue(0);
    mockPersonaCreate.mockResolvedValue(SAMPLE_PERSONA);
    const req = makeRequest("POST", {
      name: "Marketing Manager",
      ageRange: "25-34",
      interests: ["SaaS"],
    });
    const res = await createPersona(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.persona.name).toBe("Marketing Manager");
  });
});

// ── PATCH /api/audience-personas/[id] ─────────────────────────────────────────

describe("PATCH /api/audience-personas/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest("PATCH", { name: "Updated" });
    const res = await updatePersona(req, { params: Promise.resolve({ id: "persona-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_FAIL);
    const req = makeRequest("PATCH", { name: "Updated" });
    const res = await updatePersona(req, { params: Promise.resolve({ id: "persona-1" }) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when persona not found", async () => {
    mockPersonaFindUnique.mockResolvedValue(null);
    const req = makeRequest("PATCH", { name: "Updated" });
    const res = await updatePersona(req, { params: Promise.resolve({ id: "not-found" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when persona belongs to another user", async () => {
    mockPersonaFindUnique.mockResolvedValue({ ...SAMPLE_PERSONA, userId: "other-user" });
    const req = makeRequest("PATCH", { name: "Updated" });
    const res = await updatePersona(req, { params: Promise.resolve({ id: "persona-1" }) });
    expect(res.status).toBe(403);
  });

  it("updates persona and returns 200", async () => {
    mockPersonaFindUnique.mockResolvedValue(SAMPLE_PERSONA);
    const updated = { ...SAMPLE_PERSONA, name: "Updated Name" };
    mockPersonaUpdate.mockResolvedValue(updated);
    const req = makeRequest("PATCH", { name: "Updated Name" });
    const res = await updatePersona(req, { params: Promise.resolve({ id: "persona-1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.persona.name).toBe("Updated Name");
  });
});

// ── DELETE /api/audience-personas/[id] ────────────────────────────────────────

describe("DELETE /api/audience-personas/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest("DELETE");
    const res = await deletePersona(req, { params: Promise.resolve({ id: "persona-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_FAIL);
    const req = makeRequest("DELETE");
    const res = await deletePersona(req, { params: Promise.resolve({ id: "persona-1" }) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when persona not found", async () => {
    mockPersonaFindUnique.mockResolvedValue(null);
    const req = makeRequest("DELETE");
    const res = await deletePersona(req, { params: Promise.resolve({ id: "not-found" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when persona belongs to another user", async () => {
    mockPersonaFindUnique.mockResolvedValue({ ...SAMPLE_PERSONA, userId: "other-user" });
    const req = makeRequest("DELETE");
    const res = await deletePersona(req, { params: Promise.resolve({ id: "persona-1" }) });
    expect(res.status).toBe(403);
  });

  it("deletes persona and returns 204", async () => {
    mockPersonaFindUnique.mockResolvedValue(SAMPLE_PERSONA);
    mockPersonaDelete.mockResolvedValue(SAMPLE_PERSONA);
    const req = makeRequest("DELETE");
    const res = await deletePersona(req, { params: Promise.resolve({ id: "persona-1" }) });
    expect(res.status).toBe(204);
    expect(mockPersonaDelete).toHaveBeenCalledWith({ where: { id: "persona-1" } });
  });
});
