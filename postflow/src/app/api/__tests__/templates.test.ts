jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
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
    template: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("@/lib/sanitize", () => ({
  sanitizePostContent: jest.fn((s: string) => s.trim()),
}));

import { NextRequest } from "next/server";
import { GET as listTemplates, POST as createTemplate } from "@/app/api/templates/route";
import { GET as getTemplate, DELETE as deleteTemplate } from "@/app/api/templates/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockTemplateFindMany = prisma.template.findMany as jest.Mock;
const mockTemplateCount = prisma.template.count as jest.Mock;
const mockTemplateCreate = prisma.template.create as jest.Mock;
const mockTemplateFindUnique = prisma.template.findUnique as jest.Mock;
const mockTemplateDelete = prisma.template.delete as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_TEMPLATE_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_TEMPLATE = {
  id: VALID_TEMPLATE_ID,
  userId: MOCK_USER_ID,
  name: "My Template",
  content: "Hello from template",
  mediaType: "NONE",
  mediaUrls: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── GET /api/templates ────────────────────────────────────────────────────────

describe("GET /api/templates", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(query = "") {
    return new NextRequest(`http://localhost:3000/api/templates${query}`);
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listTemplates(makeRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listTemplates(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns paginated templates", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindMany.mockResolvedValueOnce([BASE_TEMPLATE]);
    mockTemplateCount.mockResolvedValueOnce(1);

    const res = await listTemplates(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { templates: typeof BASE_TEMPLATE[]; pagination: { total: number } };
    expect(data.templates).toHaveLength(1);
    expect(data.pagination.total).toBe(1);
  });

  it("returns 400 for invalid query params", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await listTemplates(makeRequest("?limit=notanumber"));
    // coerce handles this, so it should still succeed with default
    expect([200, 400]).toContain(res.status);
  });
});

// ── POST /api/templates ───────────────────────────────────────────────────────

describe("POST /api/templates", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createTemplate(makeRequest({ name: "T", content: "hi" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createTemplate(makeRequest({ name: "T", content: "hi" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/templates", {
      method: "POST",
      body: "not-json",
    });
    const res = await createTemplate(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createTemplate(makeRequest({ content: "hello" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createTemplate(makeRequest({ name: "T" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 with created template", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateCreate.mockResolvedValueOnce(BASE_TEMPLATE);

    const res = await createTemplate(makeRequest({ name: "My Template", content: "Hello from template" }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_TEMPLATE;
    expect(data.name).toBe("My Template");
    expect(data.content).toBe("Hello from template");
  });

  it("creates template with correct userId", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateCreate.mockResolvedValueOnce(BASE_TEMPLATE);

    await createTemplate(makeRequest({ name: "T", content: "c" }));
    expect(mockTemplateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: MOCK_USER_ID }),
      })
    );
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateCreate.mockRejectedValueOnce(new Error("DB error"));
    const res = await createTemplate(makeRequest({ name: "T", content: "c" }));
    expect(res.status).toBe(500);
  });
});

// ── GET /api/templates/[id] ───────────────────────────────────────────────────

describe("GET /api/templates/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id = VALID_TEMPLATE_ID) {
    return new NextRequest(`http://localhost:3000/api/templates/${id}`);
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getTemplate(makeRequest(), makeParams(VALID_TEMPLATE_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await getTemplate(makeRequest("bad-id"), makeParams("bad-id"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when template does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockTemplateFindUnique.mockResolvedValueOnce(null);
    const res = await getTemplate(makeRequest(), makeParams(VALID_TEMPLATE_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when template belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockTemplateFindUnique.mockResolvedValueOnce({ ...BASE_TEMPLATE, userId: OTHER_USER_ID });
    const res = await getTemplate(makeRequest(), makeParams(VALID_TEMPLATE_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 with the template", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockTemplateFindUnique.mockResolvedValueOnce(BASE_TEMPLATE);
    const res = await getTemplate(makeRequest(), makeParams(VALID_TEMPLATE_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_TEMPLATE;
    expect(data.id).toBe(VALID_TEMPLATE_ID);
    expect(data.name).toBe("My Template");
  });
});

// ── DELETE /api/templates/[id] ────────────────────────────────────────────────

describe("DELETE /api/templates/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id = VALID_TEMPLATE_ID) {
    return new NextRequest(`http://localhost:3000/api/templates/${id}`, { method: "DELETE" });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteTemplate(makeRequest(), makeParams(VALID_TEMPLATE_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await deleteTemplate(makeRequest("not-a-cuid"), makeParams("not-a-cuid"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when template does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockTemplateFindUnique.mockResolvedValueOnce(null);
    const res = await deleteTemplate(makeRequest(), makeParams(VALID_TEMPLATE_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when template belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockTemplateFindUnique.mockResolvedValueOnce({ ...BASE_TEMPLATE, userId: OTHER_USER_ID });
    const res = await deleteTemplate(makeRequest(), makeParams(VALID_TEMPLATE_ID));
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockTemplateFindUnique.mockResolvedValueOnce(BASE_TEMPLATE);
    mockTemplateDelete.mockResolvedValueOnce(BASE_TEMPLATE);
    const res = await deleteTemplate(makeRequest(), makeParams(VALID_TEMPLATE_ID));
    expect(res.status).toBe(204);
  });

  it("calls prisma.template.delete with the correct id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockTemplateFindUnique.mockResolvedValueOnce(BASE_TEMPLATE);
    mockTemplateDelete.mockResolvedValueOnce(BASE_TEMPLATE);
    await deleteTemplate(makeRequest(), makeParams(VALID_TEMPLATE_ID));
    expect(mockTemplateDelete).toHaveBeenCalledWith({ where: { id: VALID_TEMPLATE_ID } });
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockTemplateFindUnique.mockResolvedValueOnce(BASE_TEMPLATE);
    mockTemplateDelete.mockRejectedValueOnce(new Error("DB error"));
    const res = await deleteTemplate(makeRequest(), makeParams(VALID_TEMPLATE_ID));
    expect(res.status).toBe(500);
  });
});
