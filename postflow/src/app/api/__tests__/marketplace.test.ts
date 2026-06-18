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
  ipLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    template: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    templateImport: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { GET as browseMarketplace } from "@/app/api/marketplace/templates/route";
import { POST as importTemplate } from "@/app/api/marketplace/templates/[id]/route";
import { POST as publishTemplate } from "@/app/api/templates/[id]/publish/route";
import { POST as unpublishTemplate } from "@/app/api/templates/[id]/unpublish/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, ipLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockIpLimiter = ipLimiter as jest.Mock;
const mockTemplateFindMany = prisma.template.findMany as jest.Mock;
const mockTemplateCount = prisma.template.count as jest.Mock;
const mockTemplateFindUnique = prisma.template.findUnique as jest.Mock;
const mockTemplateCreate = prisma.template.create as jest.Mock;
const mockTemplateUpdate = prisma.template.update as jest.Mock;
const mockTemplateImportFindUnique = prisma.templateImport.findUnique as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_TEMPLATE_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_TEMPLATE = {
  id: VALID_TEMPLATE_ID,
  userId: MOCK_USER_ID,
  name: "Community Template",
  content: "This is a community template for testing",
  mediaType: "NONE",
  mediaUrls: [],
  marketplacePublished: true,
  marketplaceCategory: "Marketing",
  marketplaceTags: ["social", "promo"],
  importCount: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── GET /api/marketplace/templates ───────────────────────────────────────────

describe("GET /api/marketplace/templates", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(query = "") {
    return new NextRequest(`http://localhost:3000/api/marketplace/templates${query}`);
  }

  it("returns 429 when IP rate limit exceeded", async () => {
    mockIpLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await browseMarketplace(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 200 with empty list when no published templates", async () => {
    mockIpLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindMany.mockResolvedValueOnce([]);
    mockTemplateCount.mockResolvedValueOnce(0);
    const res = await browseMarketplace(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { templates: unknown[]; total: number; page: number; limit: number; totalPages: number };
    expect(body.templates).toHaveLength(0);
    expect(body.total).toBe(0);
    expect(body.page).toBe(1);
    expect(body.totalPages).toBe(0);
  });

  it("returns 200 with published templates", async () => {
    mockIpLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindMany.mockResolvedValueOnce([BASE_TEMPLATE]);
    mockTemplateCount.mockResolvedValueOnce(1);
    const res = await browseMarketplace(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { templates: typeof BASE_TEMPLATE[] };
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0].id).toBe(VALID_TEMPLATE_ID);
  });

  it("passes category filter to prisma query", async () => {
    mockIpLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindMany.mockResolvedValueOnce([BASE_TEMPLATE]);
    mockTemplateCount.mockResolvedValueOnce(1);
    await browseMarketplace(makeRequest("?category=Marketing"));
    expect(mockTemplateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ marketplaceCategory: "Marketing" }),
      })
    );
  });

  it("passes tag filter to prisma query", async () => {
    mockIpLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindMany.mockResolvedValueOnce([BASE_TEMPLATE]);
    mockTemplateCount.mockResolvedValueOnce(1);
    await browseMarketplace(makeRequest("?tag=social"));
    expect(mockTemplateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ marketplaceTags: { has: "social" } }),
      })
    );
  });

  it("passes search filter to prisma query", async () => {
    mockIpLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindMany.mockResolvedValueOnce([BASE_TEMPLATE]);
    mockTemplateCount.mockResolvedValueOnce(1);
    await browseMarketplace(makeRequest("?search=community"));
    expect(mockTemplateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ name: expect.objectContaining({ contains: "community" }) }),
          ]),
        }),
      })
    );
  });

  it("returns correct pagination metadata", async () => {
    mockIpLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindMany.mockResolvedValueOnce([BASE_TEMPLATE]);
    mockTemplateCount.mockResolvedValueOnce(45);
    const res = await browseMarketplace(makeRequest("?limit=20&page=2"));
    expect(res.status).toBe(200);
    const body = await res.json() as { total: number; page: number; limit: number; totalPages: number };
    expect(body.total).toBe(45);
    expect(body.page).toBe(2);
    expect(body.limit).toBe(20);
    expect(body.totalPages).toBe(3);
  });
});

// ── POST /api/marketplace/templates/[id] (import) ────────────────────────────

describe("POST /api/marketplace/templates/[id] (import)", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest() {
    return new NextRequest(`http://localhost:3000/api/marketplace/templates/${VALID_TEMPLATE_ID}`, {
      method: "POST",
    });
  }

  function makeParams() {
    return { params: Promise.resolve({ id: VALID_TEMPLATE_ID }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await importTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await importTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(429);
  });

  it("returns 404 when template does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce(null);
    const res = await importTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 404 when template is not published", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce({ ...BASE_TEMPLATE, marketplacePublished: false });
    const res = await importTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns alreadyImported when user already imported", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce(BASE_TEMPLATE);
    mockTemplateImportFindUnique.mockResolvedValueOnce({ id: "existing-import-id" });
    const res = await importTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json() as { alreadyImported: boolean; newTemplateId: null };
    expect(body.alreadyImported).toBe(true);
    expect(body.newTemplateId).toBeNull();
  });

  it("creates a copy and import record on first import", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce(BASE_TEMPLATE);
    mockTemplateImportFindUnique.mockResolvedValueOnce(null);
    const newTemplate = { ...BASE_TEMPLATE, id: "new-template-id", userId: MOCK_USER_ID, marketplacePublished: false };
    mockTransaction.mockImplementationOnce(async (ops: Array<() => Promise<unknown>>) => {
      return [newTemplate, {}, {}];
    });
    const res = await importTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json() as { alreadyImported: boolean; newTemplateId: string };
    expect(body.alreadyImported).toBe(false);
    expect(body.newTemplateId).toBeDefined();
  });
});

// ── POST /api/templates/[id]/publish ─────────────────────────────────────────

describe("POST /api/templates/[id]/publish", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: Record<string, unknown> = {}) {
    return new NextRequest(`http://localhost:3000/api/templates/${VALID_TEMPLATE_ID}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function makeParams() {
    return { params: Promise.resolve({ id: VALID_TEMPLATE_ID }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await publishTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await publishTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(429);
  });

  it("returns 404 when template not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce(null);
    const res = await publishTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 404 when template belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce({ ...BASE_TEMPLATE, userId: OTHER_USER_ID });
    const res = await publishTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 422 when template content is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce({ ...BASE_TEMPLATE, content: "   " });
    const res = await publishTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(422);
  });

  it("publishes template successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce(BASE_TEMPLATE);
    const updated = {
      id: VALID_TEMPLATE_ID,
      marketplacePublished: true,
      marketplaceCategory: "Marketing",
      marketplaceTags: ["social"],
    };
    mockTemplateUpdate.mockResolvedValueOnce(updated);
    const res = await publishTemplate(makeRequest({ category: "Marketing", tags: ["social"] }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json() as typeof updated;
    expect(body.marketplacePublished).toBe(true);
    expect(body.marketplaceCategory).toBe("Marketing");
  });

  it("publishes without optional category/tags", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce(BASE_TEMPLATE);
    const updated = { id: VALID_TEMPLATE_ID, marketplacePublished: true, marketplaceCategory: null, marketplaceTags: [] };
    mockTemplateUpdate.mockResolvedValueOnce(updated);
    const res = await publishTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json() as typeof updated;
    expect(body.marketplacePublished).toBe(true);
  });
});

// ── POST /api/templates/[id]/unpublish ───────────────────────────────────────

describe("POST /api/templates/[id]/unpublish", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest() {
    return new NextRequest(`http://localhost:3000/api/templates/${VALID_TEMPLATE_ID}/unpublish`, {
      method: "POST",
    });
  }

  function makeParams() {
    return { params: Promise.resolve({ id: VALID_TEMPLATE_ID }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await unpublishTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await unpublishTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(429);
  });

  it("returns 404 when template not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce(null);
    const res = await unpublishTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 404 when template belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce({ ...BASE_TEMPLATE, userId: OTHER_USER_ID });
    const res = await unpublishTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("unpublishes template successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce(BASE_TEMPLATE);
    const updated = {
      id: VALID_TEMPLATE_ID,
      marketplacePublished: false,
      marketplaceCategory: "Marketing",
      marketplaceTags: ["social"],
    };
    mockTemplateUpdate.mockResolvedValueOnce(updated);
    const res = await unpublishTemplate(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json() as typeof updated;
    expect(body.marketplacePublished).toBe(false);
    expect(body.id).toBe(VALID_TEMPLATE_ID);
  });

  it("calls prisma update with marketplacePublished: false", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockTemplateFindUnique.mockResolvedValueOnce(BASE_TEMPLATE);
    const updated = { id: VALID_TEMPLATE_ID, marketplacePublished: false, marketplaceCategory: null, marketplaceTags: [] };
    mockTemplateUpdate.mockResolvedValueOnce(updated);
    await unpublishTemplate(makeRequest(), makeParams());
    expect(mockTemplateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { marketplacePublished: false },
      })
    );
  });
});
