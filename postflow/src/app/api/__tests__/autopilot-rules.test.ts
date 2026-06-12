jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  workerLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  TriggerType: {
    QUEUE_EMPTY: "QUEUE_EMPTY",
    LOW_ENGAGEMENT: "LOW_ENGAGEMENT",
    EVERGREEN_DUE: "EVERGREEN_DUE",
    POSTING_GAP: "POSTING_GAP",
    DAILY_SCHEDULE: "DAILY_SCHEDULE",
  },
  ActionType: {
    PUBLISH_EVERGREEN: "PUBLISH_EVERGREEN",
    RESCHEDULE_POST: "RESCHEDULE_POST",
    SEND_NOTIFICATION: "SEND_NOTIFICATION",
    PAUSE_PUBLISHING: "PAUSE_PUBLISHING",
    CREATE_FROM_TEMPLATE: "CREATE_FROM_TEMPLATE",
  },
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
    autopilotRule: {
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
import { GET as listRules, POST as createRule } from "@/app/api/autopilot-rules/route";
import { PATCH as updateRule, DELETE as deleteRule } from "@/app/api/autopilot-rules/[id]/route";
import { PATCH as toggleRule } from "@/app/api/autopilot-rules/[id]/toggle/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.autopilotRule.findMany as jest.Mock;
const mockFindUnique = prisma.autopilotRule.findUnique as jest.Mock;
const mockCreate = prisma.autopilotRule.create as jest.Mock;
const mockUpdate = prisma.autopilotRule.update as jest.Mock;
const mockDelete = prisma.autopilotRule.delete as jest.Mock;
const mockCount = prisma.autopilotRule.count as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_RULE_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";

const MOCK_RULE = {
  id: VALID_RULE_ID,
  userId: MOCK_USER_ID,
  name: "Test Rule",
  description: null,
  trigger: "QUEUE_EMPTY",
  conditionJson: { threshold: 3 },
  action: "SEND_NOTIFICATION",
  actionDataJson: { title: "Queue low", body: "Add more posts" },
  isActive: true,
  lastTriggeredAt: null,
  triggerCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function makeRequest(body?: unknown): NextRequest {
  const req = new NextRequest("http://localhost/api/autopilot-rules", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return req;
}

function makeIdRequest(id: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/autopilot-rules/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: MOCK_USER_ID } });
  mockApiLimiter.mockResolvedValue({ success: true });
});

// ── GET /api/autopilot-rules ──────────────────────────────────────────────────

describe("GET /api/autopilot-rules", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listRules();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false });
    const res = await listRules();
    expect(res.status).toBe(429);
  });

  it("returns empty rules array", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await listRules();
    expect(res.status).toBe(200);
    const data = await res.json() as { rules: unknown[] };
    expect(data.rules).toEqual([]);
  });

  it("returns rules with correct shape", async () => {
    mockFindMany.mockResolvedValue([MOCK_RULE]);
    const res = await listRules();
    expect(res.status).toBe(200);
    const data = await res.json() as { rules: typeof MOCK_RULE[] };
    expect(data.rules).toHaveLength(1);
    expect(data.rules[0]).toMatchObject({
      id: VALID_RULE_ID,
      name: "Test Rule",
      trigger: "QUEUE_EMPTY",
      action: "SEND_NOTIFICATION",
      isActive: true,
      triggerCount: 0,
    });
  });
});

// ── POST /api/autopilot-rules ─────────────────────────────────────────────────

describe("POST /api/autopilot-rules", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest({ name: "test", trigger: "QUEUE_EMPTY", conditionJson: {}, action: "SEND_NOTIFICATION" });
    const res = await createRule(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false });
    const req = makeRequest({ name: "test", trigger: "QUEUE_EMPTY", conditionJson: {}, action: "SEND_NOTIFICATION" });
    const res = await createRule(req);
    expect(res.status).toBe(429);
  });

  it("returns 422 when max limit reached", async () => {
    mockCount.mockResolvedValue(20);
    const req = makeRequest({ name: "test", trigger: "QUEUE_EMPTY", conditionJson: {}, action: "SEND_NOTIFICATION" });
    const res = await createRule(req);
    expect(res.status).toBe(422);
  });

  it("returns 400 for missing name", async () => {
    mockCount.mockResolvedValue(0);
    const req = makeRequest({ trigger: "QUEUE_EMPTY", conditionJson: {}, action: "SEND_NOTIFICATION" });
    const res = await createRule(req);
    expect(res.status).toBe(400);
  });

  it("returns 201 with created rule", async () => {
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue(MOCK_RULE);
    const req = makeRequest({
      name: "Test Rule",
      trigger: "QUEUE_EMPTY",
      conditionJson: { threshold: 3 },
      action: "SEND_NOTIFICATION",
      actionDataJson: {},
    });
    const res = await createRule(req);
    expect(res.status).toBe(201);
    const data = await res.json() as { rule: typeof MOCK_RULE };
    expect(data.rule.name).toBe("Test Rule");
  });
});

// ── PATCH /api/autopilot-rules/[id] ──────────────────────────────────────────

describe("PATCH /api/autopilot-rules/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeIdRequest(VALID_RULE_ID, "PATCH", { name: "Updated" });
    const res = await updateRule(req, { params: Promise.resolve({ id: VALID_RULE_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when not owner", async () => {
    mockFindUnique.mockResolvedValue({ userId: OTHER_USER_ID });
    const req = makeIdRequest(VALID_RULE_ID, "PATCH", { name: "Updated" });
    const res = await updateRule(req, { params: Promise.resolve({ id: VALID_RULE_ID }) });
    expect(res.status).toBe(403);
  });

  it("returns updated rule", async () => {
    mockFindUnique.mockResolvedValue({ userId: MOCK_USER_ID });
    mockUpdate.mockResolvedValue({ ...MOCK_RULE, name: "Updated" });
    const req = makeIdRequest(VALID_RULE_ID, "PATCH", { name: "Updated" });
    const res = await updateRule(req, { params: Promise.resolve({ id: VALID_RULE_ID }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { rule: { name: string } };
    expect(data.rule.name).toBe("Updated");
  });
});

// ── DELETE /api/autopilot-rules/[id] ─────────────────────────────────────────

describe("DELETE /api/autopilot-rules/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeIdRequest(VALID_RULE_ID, "DELETE");
    const res = await deleteRule(req, { params: Promise.resolve({ id: VALID_RULE_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = makeIdRequest(VALID_RULE_ID, "DELETE");
    const res = await deleteRule(req, { params: Promise.resolve({ id: VALID_RULE_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 204 on success", async () => {
    mockFindUnique.mockResolvedValue({ userId: MOCK_USER_ID });
    mockDelete.mockResolvedValue({});
    const req = makeIdRequest(VALID_RULE_ID, "DELETE");
    const res = await deleteRule(req, { params: Promise.resolve({ id: VALID_RULE_ID }) });
    expect(res.status).toBe(204);
  });
});

// ── PATCH /api/autopilot-rules/[id]/toggle ────────────────────────────────────

describe("PATCH /api/autopilot-rules/[id]/toggle", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeIdRequest(VALID_RULE_ID, "PATCH");
    const res = await toggleRule(req, { params: Promise.resolve({ id: VALID_RULE_ID }) });
    expect(res.status).toBe(401);
  });

  it("toggles isActive from true to false", async () => {
    mockFindUnique.mockResolvedValue({ userId: MOCK_USER_ID, isActive: true });
    mockUpdate.mockResolvedValue({ id: VALID_RULE_ID, isActive: false });
    const req = makeIdRequest(VALID_RULE_ID, "PATCH");
    const res = await toggleRule(req, { params: Promise.resolve({ id: VALID_RULE_ID }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { rule: { isActive: boolean } };
    expect(data.rule.isActive).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
  });

  it("toggles isActive from false to true", async () => {
    mockFindUnique.mockResolvedValue({ userId: MOCK_USER_ID, isActive: false });
    mockUpdate.mockResolvedValue({ id: VALID_RULE_ID, isActive: true });
    const req = makeIdRequest(VALID_RULE_ID, "PATCH");
    const res = await toggleRule(req, { params: Promise.resolve({ id: VALID_RULE_ID }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { rule: { isActive: boolean } };
    expect(data.rule.isActive).toBe(true);
  });
});
