jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    responseTemplate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listTemplates, POST as createTemplate } from "@/app/api/response-templates/route";
import { PATCH as updateTemplate, DELETE as deleteTemplate } from "@/app/api/response-templates/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.responseTemplate.findMany as jest.Mock;
const mockFindUnique = prisma.responseTemplate.findUnique as jest.Mock;
const mockCreate = prisma.responseTemplate.create as jest.Mock;
const mockUpdate = prisma.responseTemplate.update as jest.Mock;
const mockDelete = prisma.responseTemplate.delete as jest.Mock;
const mockCount = prisma.responseTemplate.count as jest.Mock;

const MOCK_USER_ID = "user1";
const TEMPLATE_ID = "tmpl1";
const OTHER_USER_ID = "other1";
const AUTHED = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RL_OK = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

const BASE_TEMPLATE = {
  id: TEMPLATE_ID,
  userId: MOCK_USER_ID,
  name: "Thank you",
  content: "Thanks for your kind comment!",
  category: "Thanks",
  usageCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeGet(url: string) {
  return new NextRequest(url, { method: "GET" });
}
function makePost(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function makePatch(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function makeDelete(url: string) {
  return new NextRequest(url, { method: "DELETE" });
}

describe("GET /api/response-templates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([BASE_TEMPLATE]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listTemplates(makeGet("http://localhost/api/response-templates"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_EXCEEDED);
    const res = await listTemplates(makeGet("http://localhost/api/response-templates"));
    expect(res.status).toBe(429);
  });

  it("returns list of templates", async () => {
    const res = await listTemplates(makeGet("http://localhost/api/response-templates"));
    expect(res.status).toBe(200);
    const data = await res.json() as { templates: typeof BASE_TEMPLATE[] };
    expect(data.templates).toHaveLength(1);
    expect(data.templates[0].name).toBe("Thank you");
  });
});

describe("POST /api/response-templates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue(BASE_TEMPLATE);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await createTemplate(makePost("http://localhost/api/response-templates", {}));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_EXCEEDED);
    const res = await createTemplate(makePost("http://localhost/api/response-templates", {}));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/response-templates", {
      method: "POST",
      body: "invalid-json",
    });
    const res = await createTemplate(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await createTemplate(
      makePost("http://localhost/api/response-templates", { name: "Test" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when max templates reached", async () => {
    mockCount.mockResolvedValue(50);
    const res = await createTemplate(
      makePost("http://localhost/api/response-templates", {
        name: "Test",
        content: "Test content",
      })
    );
    expect(res.status).toBe(422);
  });

  it("creates template and returns 201", async () => {
    const res = await createTemplate(
      makePost("http://localhost/api/response-templates", {
        name: "Thank you",
        content: "Thanks for your comment!",
        category: "Thanks",
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json() as { template: typeof BASE_TEMPLATE };
    expect(data.template.name).toBe("Thank you");
  });
});

describe("PATCH /api/response-templates/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindUnique.mockResolvedValue(BASE_TEMPLATE);
    mockUpdate.mockResolvedValue({ ...BASE_TEMPLATE, name: "Updated" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await updateTemplate(
      makePatch(`http://localhost/api/response-templates/${TEMPLATE_ID}`, { name: "New" }),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await updateTemplate(
      makePatch(`http://localhost/api/response-templates/${TEMPLATE_ID}`, { name: "New" }),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when not owner", async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_TEMPLATE, userId: OTHER_USER_ID });
    const res = await updateTemplate(
      makePatch(`http://localhost/api/response-templates/${TEMPLATE_ID}`, { name: "New" }),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it("updates template successfully", async () => {
    const res = await updateTemplate(
      makePatch(`http://localhost/api/response-templates/${TEMPLATE_ID}`, { name: "Updated" }),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { template: typeof BASE_TEMPLATE };
    expect(data.template.name).toBe("Updated");
  });
});

describe("DELETE /api/response-templates/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockFindUnique.mockResolvedValue(BASE_TEMPLATE);
    mockDelete.mockResolvedValue(BASE_TEMPLATE);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await deleteTemplate(
      makeDelete(`http://localhost/api/response-templates/${TEMPLATE_ID}`),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await deleteTemplate(
      makeDelete(`http://localhost/api/response-templates/${TEMPLATE_ID}`),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for wrong owner", async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_TEMPLATE, userId: OTHER_USER_ID });
    const res = await deleteTemplate(
      makeDelete(`http://localhost/api/response-templates/${TEMPLATE_ID}`),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it("deletes template and returns 204", async () => {
    const res = await deleteTemplate(
      makeDelete(`http://localhost/api/response-templates/${TEMPLATE_ID}`),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );
    expect(res.status).toBe(204);
  });
});
