jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    contentRule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("@/lib/content-rules", () => ({
  checkContentRules: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET as listRules, POST as createRule } from "@/app/api/content-rules/route";
import { PATCH as updateRule, DELETE as deleteRule } from "@/app/api/content-rules/[id]/route";
import { POST as checkRules } from "@/app/api/content-rules/check/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { checkContentRules } from "@/lib/content-rules";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.contentRule.findMany as jest.Mock;
const mockFindUnique = prisma.contentRule.findUnique as jest.Mock;
const mockCount = prisma.contentRule.count as jest.Mock;
const mockCreate = prisma.contentRule.create as jest.Mock;
const mockUpdate = prisma.contentRule.update as jest.Mock;
const mockDelete = prisma.contentRule.delete as jest.Mock;
const mockCheckContentRules = checkContentRules as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_RULE_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_RULE = {
  id: VALID_RULE_ID,
  userId: MOCK_USER_ID,
  name: "Must include brand hashtag",
  type: "REQUIRED_HASHTAG",
  value: "#brand",
  platforms: [],
  severity: "WARNING",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── GET /api/content-rules ────────────────────────────────────────────────────

describe("GET /api/content-rules", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listRules();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listRules();
    expect(res.status).toBe(429);
  });

  it("returns list of rules for authenticated user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_RULE]);

    const res = await listRules();
    expect(res.status).toBe(200);
    const data = await res.json() as { rules: typeof BASE_RULE[] };
    expect(data.rules).toHaveLength(1);
    expect(data.rules[0].name).toBe("Must include brand hashtag");
    expect(data.rules[0].type).toBe("REQUIRED_HASHTAG");
  });

  it("queries rules ordered by createdAt asc for the authenticated user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    await listRules();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID },
        orderBy: { createdAt: "asc" },
      })
    );
  });

  it("returns empty rules array when user has no rules", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await listRules();
    expect(res.status).toBe(200);
    const data = await res.json() as { rules: unknown[] };
    expect(data.rules).toHaveLength(0);
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB error"));

    const res = await listRules();
    expect(res.status).toBe(500);
  });
});

// ── POST /api/content-rules ───────────────────────────────────────────────────

describe("POST /api/content-rules", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/content-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createRule(makeRequest({ name: "Test Rule", type: "REQUIRED_HASHTAG" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createRule(makeRequest({ name: "Test Rule", type: "REQUIRED_HASHTAG" }));
    expect(res.status).toBe(429);
  });

  it("returns 422 when max rules limit (50) is reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(50);

    const res = await createRule(makeRequest({ name: "Test Rule", type: "REQUIRED_HASHTAG" }));
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);

    const req = new NextRequest("http://localhost:3000/api/content-rules", {
      method: "POST",
      body: "not-json",
    });
    const res = await createRule(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);

    const res = await createRule(makeRequest({ type: "REQUIRED_HASHTAG", value: "#brand" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when type is invalid", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);

    const res = await createRule(makeRequest({ name: "Test", type: "INVALID_TYPE", value: "#brand" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 with created rule", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_RULE);

    const res = await createRule(makeRequest({ name: "Must include brand hashtag", type: "REQUIRED_HASHTAG", value: "#brand" }));
    expect(res.status).toBe(201);
    const data = await res.json() as { rule: typeof BASE_RULE };
    expect(data.rule.name).toBe("Must include brand hashtag");
    expect(data.rule.type).toBe("REQUIRED_HASHTAG");
  });

  it("creates rule with the authenticated user's ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_RULE);

    await createRule(makeRequest({ name: "Test Rule", type: "REQUIRED_HASHTAG", value: "#brand" }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: MOCK_USER_ID }),
      })
    );
  });

  it("creates REQUIRED_CTA rule with empty value by default", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    const ctaRule = { ...BASE_RULE, type: "REQUIRED_CTA", value: "" };
    mockCreate.mockResolvedValueOnce(ctaRule);

    const res = await createRule(makeRequest({ name: "Requires CTA", type: "REQUIRED_CTA" }));
    expect(res.status).toBe(201);
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockRejectedValueOnce(new Error("DB error"));

    const res = await createRule(makeRequest({ name: "Test Rule", type: "REQUIRED_HASHTAG" }));
    expect(res.status).toBe(500);
  });
});

// ── PATCH /api/content-rules/[id] ────────────────────────────────────────────

describe("PATCH /api/content-rules/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id: string, body: unknown) {
    return new NextRequest(`http://localhost:3000/api/content-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateRule(makeRequest(VALID_RULE_ID, { isActive: false }), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await updateRule(makeRequest(VALID_RULE_ID, { isActive: false }), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await updateRule(makeRequest("bad-id", { isActive: false }), makeParams("bad-id"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when rule does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await updateRule(makeRequest(VALID_RULE_ID, { isActive: false }), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when rule belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_RULE, userId: OTHER_USER_ID });
    const res = await updateRule(makeRequest(VALID_RULE_ID, { isActive: false }), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_RULE);

    const req = new NextRequest(`http://localhost:3000/api/content-rules/${VALID_RULE_ID}`, {
      method: "PATCH",
      body: "not-json",
    });
    const res = await updateRule(req, makeParams(VALID_RULE_ID));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid severity value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_RULE);

    const res = await updateRule(makeRequest(VALID_RULE_ID, { severity: "INVALID" }), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(400);
  });

  it("returns 200 with updated rule", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_RULE);
    const updated = { ...BASE_RULE, isActive: false };
    mockUpdate.mockResolvedValueOnce(updated);

    const res = await updateRule(makeRequest(VALID_RULE_ID, { isActive: false }), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(200);
    const data = await res.json() as { rule: typeof updated };
    expect(data.rule.isActive).toBe(false);
  });

  it("returns 200 when toggling severity to ERROR", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_RULE);
    const updated = { ...BASE_RULE, severity: "ERROR" };
    mockUpdate.mockResolvedValueOnce(updated);

    const res = await updateRule(makeRequest(VALID_RULE_ID, { severity: "ERROR" }), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(200);
    const data = await res.json() as { rule: typeof updated };
    expect(data.rule.severity).toBe("ERROR");
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_RULE);
    mockUpdate.mockRejectedValueOnce(new Error("DB error"));

    const res = await updateRule(makeRequest(VALID_RULE_ID, { isActive: false }), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(500);
  });
});

// ── DELETE /api/content-rules/[id] ───────────────────────────────────────────

describe("DELETE /api/content-rules/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id: string) {
    return new NextRequest(`http://localhost:3000/api/content-rules/${id}`, { method: "DELETE" });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteRule(makeRequest(VALID_RULE_ID), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteRule(makeRequest(VALID_RULE_ID), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await deleteRule(makeRequest("bad-id"), makeParams("bad-id"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when rule does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await deleteRule(makeRequest(VALID_RULE_ID), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when rule belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_RULE, userId: OTHER_USER_ID });
    const res = await deleteRule(makeRequest(VALID_RULE_ID), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_RULE);
    mockDelete.mockResolvedValueOnce(BASE_RULE);

    const res = await deleteRule(makeRequest(VALID_RULE_ID), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: VALID_RULE_ID } });
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_RULE);
    mockDelete.mockRejectedValueOnce(new Error("DB error"));

    const res = await deleteRule(makeRequest(VALID_RULE_ID), makeParams(VALID_RULE_ID));
    expect(res.status).toBe(500);
  });
});

// ── POST /api/content-rules/check ────────────────────────────────────────────

describe("POST /api/content-rules/check", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/content-rules/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await checkRules(makeRequest({ content: "hello world" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await checkRules(makeRequest({ content: "hello world" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = new NextRequest("http://localhost:3000/api/content-rules/check", {
      method: "POST",
      body: "not-json",
    });
    const res = await checkRules(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await checkRules(makeRequest({ platform: "FACEBOOK" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is empty string", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await checkRules(makeRequest({ content: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with compliance result when content passes all rules", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_RULE]);
    mockCheckContentRules.mockReturnValueOnce({
      compliant: true,
      violations: [],
      errors: [],
      warnings: [],
    });

    const res = await checkRules(makeRequest({ content: "check out #brand today" }));
    expect(res.status).toBe(200);
    const data = await res.json() as {
      compliant: boolean;
      violations: unknown[];
      errors: unknown[];
      warnings: unknown[];
    };
    expect(data.compliant).toBe(true);
    expect(data.violations).toHaveLength(0);
    expect(data.errors).toHaveLength(0);
    expect(data.warnings).toHaveLength(0);
  });

  it("returns 200 with violations when content fails a rule", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_RULE]);
    const violation = {
      ruleId: VALID_RULE_ID,
      ruleName: "Must include brand hashtag",
      type: "REQUIRED_HASHTAG",
      severity: "WARNING",
      message: "Content must include the hashtag #brand",
    };
    mockCheckContentRules.mockReturnValueOnce({
      compliant: true,
      violations: [violation],
      errors: [],
      warnings: [violation],
    });

    const res = await checkRules(makeRequest({ content: "no hashtags here" }));
    expect(res.status).toBe(200);
    const data = await res.json() as {
      compliant: boolean;
      violations: typeof violation[];
      warnings: typeof violation[];
    };
    expect(data.compliant).toBe(true);
    expect(data.violations).toHaveLength(1);
    expect(data.violations[0].type).toBe("REQUIRED_HASHTAG");
    expect(data.warnings).toHaveLength(1);
  });

  it("returns compliant false when there are ERROR violations", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([{ ...BASE_RULE, severity: "ERROR" }]);
    const violation = {
      ruleId: VALID_RULE_ID,
      ruleName: "Must include brand hashtag",
      type: "REQUIRED_HASHTAG",
      severity: "ERROR",
      message: "Content must include the hashtag #brand",
    };
    mockCheckContentRules.mockReturnValueOnce({
      compliant: false,
      violations: [violation],
      errors: [violation],
      warnings: [],
    });

    const res = await checkRules(makeRequest({ content: "no hashtags" }));
    expect(res.status).toBe(200);
    const data = await res.json() as { compliant: boolean; errors: unknown[] };
    expect(data.compliant).toBe(false);
    expect(data.errors).toHaveLength(1);
  });

  it("queries only active rules for the user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    mockCheckContentRules.mockReturnValueOnce({
      compliant: true,
      violations: [],
      errors: [],
      warnings: [],
    });

    await checkRules(makeRequest({ content: "hello world" }));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID, isActive: true },
      })
    );
  });

  it("passes optional platform to checkContentRules", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_RULE]);
    mockCheckContentRules.mockReturnValueOnce({
      compliant: true,
      violations: [],
      errors: [],
      warnings: [],
    });

    await checkRules(makeRequest({ content: "hello world", platform: "FACEBOOK" }));
    expect(mockCheckContentRules).toHaveBeenCalledWith(
      "hello world",
      expect.any(Array),
      "FACEBOOK"
    );
  });

  it("returns 500 on database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockRejectedValueOnce(new Error("DB error"));

    const res = await checkRules(makeRequest({ content: "hello world" }));
    expect(res.status).toBe(500);
  });
});
