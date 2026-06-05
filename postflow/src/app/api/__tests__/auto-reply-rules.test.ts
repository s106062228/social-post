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
    autoReplyRule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    responseTemplate: {
      findUnique: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listRules, POST as createRule } from "@/app/api/auto-reply-rules/route";
import { PATCH as updateRule, DELETE as deleteRule } from "@/app/api/auto-reply-rules/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockRuleFindMany = prisma.autoReplyRule.findMany as jest.Mock;
const mockRuleFindUnique = prisma.autoReplyRule.findUnique as jest.Mock;
const mockRuleCreate = prisma.autoReplyRule.create as jest.Mock;
const mockRuleUpdate = prisma.autoReplyRule.update as jest.Mock;
const mockRuleDelete = prisma.autoReplyRule.delete as jest.Mock;
const mockRuleCount = prisma.autoReplyRule.count as jest.Mock;
const mockTemplateFindUnique = prisma.responseTemplate.findUnique as jest.Mock;

const MOCK_USER_ID = "user1";
const RULE_ID = "rule1";
const TEMPLATE_ID = "tmpl1";
const OTHER_USER_ID = "other1";
const AUTHED = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RL_OK = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

const BASE_TEMPLATE = {
  id: TEMPLATE_ID,
  userId: MOCK_USER_ID,
  name: "Thank you",
  content: "Thanks for the comment!",
  category: "Thanks",
};

const BASE_RULE = {
  id: RULE_ID,
  userId: MOCK_USER_ID,
  name: "Thank you rule",
  triggerKeywords: ["thanks", "great"],
  templateId: TEMPLATE_ID,
  template: BASE_TEMPLATE,
  platform: null,
  isActive: true,
  matchCount: 0,
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

describe("GET /api/auto-reply-rules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockRuleFindMany.mockResolvedValue([BASE_RULE]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listRules(makeGet("http://localhost/api/auto-reply-rules"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_EXCEEDED);
    const res = await listRules(makeGet("http://localhost/api/auto-reply-rules"));
    expect(res.status).toBe(429);
  });

  it("returns rules with template included", async () => {
    const res = await listRules(makeGet("http://localhost/api/auto-reply-rules"));
    expect(res.status).toBe(200);
    const data = await res.json() as { rules: typeof BASE_RULE[] };
    expect(data.rules).toHaveLength(1);
    expect(data.rules[0].template.name).toBe("Thank you");
  });
});

describe("POST /api/auto-reply-rules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockRuleCount.mockResolvedValue(0);
    mockTemplateFindUnique.mockResolvedValue(BASE_TEMPLATE);
    mockRuleCreate.mockResolvedValue(BASE_RULE);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await createRule(makePost("http://localhost/api/auto-reply-rules", {}));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_EXCEEDED);
    const res = await createRule(makePost("http://localhost/api/auto-reply-rules", {}));
    expect(res.status).toBe(429);
  });

  it("returns 400 for missing keywords", async () => {
    const res = await createRule(
      makePost("http://localhost/api/auto-reply-rules", {
        name: "Test",
        templateId: TEMPLATE_ID,
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when max rules reached", async () => {
    mockRuleCount.mockResolvedValue(20);
    const res = await createRule(
      makePost("http://localhost/api/auto-reply-rules", {
        name: "Test",
        triggerKeywords: ["test"],
        templateId: TEMPLATE_ID,
      })
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when template not found", async () => {
    mockTemplateFindUnique.mockResolvedValue(null);
    const res = await createRule(
      makePost("http://localhost/api/auto-reply-rules", {
        name: "Test",
        triggerKeywords: ["test"],
        templateId: "nonexistent",
      })
    );
    expect(res.status).toBe(404);
  });

  it("creates rule and returns 201", async () => {
    const res = await createRule(
      makePost("http://localhost/api/auto-reply-rules", {
        name: "Thank you rule",
        triggerKeywords: ["thanks", "great"],
        templateId: TEMPLATE_ID,
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json() as { rule: typeof BASE_RULE };
    expect(data.rule.triggerKeywords).toContain("thanks");
  });
});

describe("PATCH /api/auto-reply-rules/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockRuleFindUnique.mockResolvedValue(BASE_RULE);
    mockRuleUpdate.mockResolvedValue({ ...BASE_RULE, isActive: false });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await updateRule(
      makePatch(`http://localhost/api/auto-reply-rules/${RULE_ID}`, { isActive: false }),
      { params: Promise.resolve({ id: RULE_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for wrong owner", async () => {
    mockRuleFindUnique.mockResolvedValue({ ...BASE_RULE, userId: OTHER_USER_ID });
    const res = await updateRule(
      makePatch(`http://localhost/api/auto-reply-rules/${RULE_ID}`, { isActive: false }),
      { params: Promise.resolve({ id: RULE_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it("updates rule successfully (toggle active)", async () => {
    const res = await updateRule(
      makePatch(`http://localhost/api/auto-reply-rules/${RULE_ID}`, { isActive: false }),
      { params: Promise.resolve({ id: RULE_ID }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { rule: typeof BASE_RULE };
    expect(data.rule.isActive).toBe(false);
  });
});

describe("DELETE /api/auto-reply-rules/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockRuleFindUnique.mockResolvedValue(BASE_RULE);
    mockRuleDelete.mockResolvedValue(BASE_RULE);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await deleteRule(
      makeDelete(`http://localhost/api/auto-reply-rules/${RULE_ID}`),
      { params: Promise.resolve({ id: RULE_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockRuleFindUnique.mockResolvedValue(null);
    const res = await deleteRule(
      makeDelete(`http://localhost/api/auto-reply-rules/${RULE_ID}`),
      { params: Promise.resolve({ id: RULE_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for wrong owner", async () => {
    mockRuleFindUnique.mockResolvedValue({ ...BASE_RULE, userId: OTHER_USER_ID });
    const res = await deleteRule(
      makeDelete(`http://localhost/api/auto-reply-rules/${RULE_ID}`),
      { params: Promise.resolve({ id: RULE_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it("deletes rule and returns 204", async () => {
    const res = await deleteRule(
      makeDelete(`http://localhost/api/auto-reply-rules/${RULE_ID}`),
      { params: Promise.resolve({ id: RULE_ID }) }
    );
    expect(res.status).toBe(204);
  });
});
