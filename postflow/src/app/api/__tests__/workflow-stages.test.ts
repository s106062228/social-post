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
    workflowStage: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      updateMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listStages, POST as createStage } from "@/app/api/workflow-stages/route";
import {
  PATCH as updateStage,
  DELETE as deleteStage,
} from "@/app/api/workflow-stages/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockStageFindMany = prisma.workflowStage.findMany as jest.Mock;
const mockStageFindUnique = prisma.workflowStage.findUnique as jest.Mock;
const mockStageCreate = prisma.workflowStage.create as jest.Mock;
const mockStageUpdate = prisma.workflowStage.update as jest.Mock;
const mockStageCount = prisma.workflowStage.count as jest.Mock;
const mockStageDelete = prisma.workflowStage.delete as jest.Mock;
const mockPostUpdateMany = prisma.post.updateMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const VALID_STAGE_ID = "clh3ck8zp0001qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_STAGE = {
  id: VALID_STAGE_ID,
  userId: MOCK_USER_ID,
  name: "In Review",
  color: "#6366f1",
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { posts: 3 },
};

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/workflow-stages", { method: "GET" });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/workflow-stages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/workflow-stages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/workflow-stages/${id}`, {
    method: "DELETE",
  });
}

// ── GET /api/workflow-stages ──────────────────────────────────────────────────

describe("GET /api/workflow-stages", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listStages(makeGetRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listStages(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it("returns empty stages array when none exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageFindMany.mockResolvedValueOnce([]);

    const res = await listStages(makeGetRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { stages: unknown[] };
    expect(Array.isArray(data.stages)).toBe(true);
    expect(data.stages).toHaveLength(0);
  });

  it("returns stages with correct shape including post count", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageFindMany.mockResolvedValueOnce([BASE_STAGE]);

    const res = await listStages(makeGetRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { stages: typeof BASE_STAGE[] };
    expect(data.stages).toHaveLength(1);
    expect(data.stages[0].name).toBe("In Review");
    expect(data.stages[0].color).toBe("#6366f1");
    expect(data.stages[0]._count.posts).toBe(3);
  });
});

// ── POST /api/workflow-stages ─────────────────────────────────────────────────

describe("POST /api/workflow-stages", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createStage(makePostRequest({ name: "Drafting" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createStage(makePostRequest({ name: "Drafting" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when max stage limit reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageCount.mockResolvedValueOnce(20);

    const res = await createStage(makePostRequest({ name: "One More" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Maximum/);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageCount.mockResolvedValueOnce(0);

    const res = await createStage(makePostRequest({}));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when color is invalid hex", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageCount.mockResolvedValueOnce(0);

    const res = await createStage(makePostRequest({ name: "Drafting", color: "notacolor" }));
    expect(res.status).toBe(400);
  });

  it("creates stage with default color and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageCount.mockResolvedValueOnce(0);
    mockStageCreate.mockResolvedValueOnce({ ...BASE_STAGE, _count: { posts: 0 } });

    const res = await createStage(makePostRequest({ name: "In Review" }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { stage: typeof BASE_STAGE };
    expect(data.stage.name).toBe("In Review");
  });

  it("creates stage with custom color and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageCount.mockResolvedValueOnce(2);
    mockStageCreate.mockResolvedValueOnce({ ...BASE_STAGE, color: "#ef4444", _count: { posts: 0 } });

    const res = await createStage(makePostRequest({ name: "Needs Work", color: "#ef4444" }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { stage: typeof BASE_STAGE };
    expect(data.stage.color).toBe("#ef4444");
  });
});

// ── PATCH /api/workflow-stages/[id] ──────────────────────────────────────────

describe("PATCH /api/workflow-stages/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateStage(makePatchRequest(VALID_STAGE_ID, { name: "Updated" }), {
      params: Promise.resolve({ id: VALID_STAGE_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await updateStage(makePatchRequest(VALID_STAGE_ID, { name: "Updated" }), {
      params: Promise.resolve({ id: VALID_STAGE_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when stage not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageFindUnique.mockResolvedValueOnce(null);

    const res = await updateStage(makePatchRequest(VALID_STAGE_ID, { name: "Updated" }), {
      params: Promise.resolve({ id: VALID_STAGE_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when stage belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageFindUnique.mockResolvedValueOnce({ ...BASE_STAGE, userId: OTHER_USER_ID });

    const res = await updateStage(makePatchRequest(VALID_STAGE_ID, { name: "Updated" }), {
      params: Promise.resolve({ id: VALID_STAGE_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("updates stage name and returns 200", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageFindUnique.mockResolvedValueOnce(BASE_STAGE);
    mockStageUpdate.mockResolvedValueOnce({ ...BASE_STAGE, name: "Ready to Publish" });

    const res = await updateStage(makePatchRequest(VALID_STAGE_ID, { name: "Ready to Publish" }), {
      params: Promise.resolve({ id: VALID_STAGE_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { stage: typeof BASE_STAGE };
    expect(data.stage.name).toBe("Ready to Publish");
  });
});

// ── DELETE /api/workflow-stages/[id] ─────────────────────────────────────────

describe("DELETE /api/workflow-stages/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteStage(makeDeleteRequest(VALID_STAGE_ID), {
      params: Promise.resolve({ id: VALID_STAGE_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteStage(makeDeleteRequest(VALID_STAGE_ID), {
      params: Promise.resolve({ id: VALID_STAGE_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when stage not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageFindUnique.mockResolvedValueOnce(null);

    const res = await deleteStage(makeDeleteRequest(VALID_STAGE_ID), {
      params: Promise.resolve({ id: VALID_STAGE_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when stage belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageFindUnique.mockResolvedValueOnce({ ...BASE_STAGE, userId: OTHER_USER_ID });

    const res = await deleteStage(makeDeleteRequest(VALID_STAGE_ID), {
      params: Promise.resolve({ id: VALID_STAGE_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("unassigns posts and deletes stage on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockStageFindUnique.mockResolvedValueOnce(BASE_STAGE);
    mockPostUpdateMany.mockResolvedValueOnce({ count: 3 });
    mockStageDelete.mockResolvedValueOnce(BASE_STAGE);

    const res = await deleteStage(makeDeleteRequest(VALID_STAGE_ID), {
      params: Promise.resolve({ id: VALID_STAGE_ID }),
    });
    expect(res.status).toBe(200);

    // Verify posts were unassigned
    expect(mockPostUpdateMany).toHaveBeenCalledWith({
      where: { workflowStageId: VALID_STAGE_ID },
      data: { workflowStageId: null },
    });

    // Verify stage was deleted
    expect(mockStageDelete).toHaveBeenCalledWith({ where: { id: VALID_STAGE_ID } });
  });
});
