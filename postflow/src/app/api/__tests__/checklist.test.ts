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
    checklistItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
    postChecklistRecord: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listItems, POST as createItem } from "@/app/api/checklist-items/route";
import {
  PATCH as updateItem,
  DELETE as deleteItem,
} from "@/app/api/checklist-items/[id]/route";
import {
  GET as getPostChecklist,
  PUT as putPostChecklist,
} from "@/app/api/posts/[id]/checklist/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockItemFindMany = prisma.checklistItem.findMany as jest.Mock;
const mockItemFindUnique = prisma.checklistItem.findUnique as jest.Mock;
const mockItemCreate = prisma.checklistItem.create as jest.Mock;
const mockItemCount = prisma.checklistItem.count as jest.Mock;
const mockItemUpdate = prisma.checklistItem.update as jest.Mock;
const mockItemDelete = prisma.checklistItem.delete as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockRecordFindUnique = prisma.postChecklistRecord.findUnique as jest.Mock;
const mockRecordUpsert = prisma.postChecklistRecord.upsert as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const ITEM_ID = "clh3ck8zp0001qr5hyvxckahk";
const POST_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_ITEM = {
  id: ITEM_ID,
  userId: MOCK_USER_ID,
  label: "Proofread content",
  description: "Check for typos and grammar",
  order: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePutRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "DELETE" });
}

function makeParams(id: string) {
  return Promise.resolve({ id });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
});

// ── GET /api/checklist-items ──────────────────────────────────────────────────

describe("GET /api/checklist-items", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listItems();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await listItems();
    expect(res.status).toBe(429);
  });

  it("returns empty list", async () => {
    mockItemFindMany.mockResolvedValue([]);
    const res = await listItems();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it("returns items for the current user", async () => {
    mockItemFindMany.mockResolvedValue([BASE_ITEM]);
    const res = await listItems();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: typeof BASE_ITEM[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].label).toBe("Proofread content");
    expect(mockItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });
});

// ── POST /api/checklist-items ─────────────────────────────────────────────────

describe("POST /api/checklist-items", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await createItem(
      makePostRequest("http://localhost:3000/api/checklist-items", { label: "x" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await createItem(
      makePostRequest("http://localhost:3000/api/checklist-items", { label: "x" })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 for missing label", async () => {
    const res = await createItem(
      makePostRequest("http://localhost:3000/api/checklist-items", {})
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when max items reached", async () => {
    mockItemCount.mockResolvedValue(20);
    const res = await createItem(
      makePostRequest("http://localhost:3000/api/checklist-items", { label: "New" })
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("20");
  });

  it("creates item successfully", async () => {
    mockItemCount.mockResolvedValue(3);
    mockItemCreate.mockResolvedValue(BASE_ITEM);
    const res = await createItem(
      makePostRequest("http://localhost:3000/api/checklist-items", {
        label: "Proofread content",
        description: "Check for typos",
        order: 0,
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { item: typeof BASE_ITEM };
    expect(body.item.label).toBe("Proofread content");
    expect(mockItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_USER_ID,
          label: "Proofread content",
        }),
      })
    );
  });
});

// ── PATCH /api/checklist-items/[id] ──────────────────────────────────────────

describe("PATCH /api/checklist-items/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await updateItem(
      makePatchRequest(`http://localhost:3000/api/checklist-items/${ITEM_ID}`, {
        label: "Updated",
      }),
      { params: makeParams(ITEM_ID) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when item not found", async () => {
    mockItemFindUnique.mockResolvedValue(null);
    const res = await updateItem(
      makePatchRequest(`http://localhost:3000/api/checklist-items/${ITEM_ID}`, {
        label: "Updated",
      }),
      { params: makeParams(ITEM_ID) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when item belongs to another user", async () => {
    mockItemFindUnique.mockResolvedValue({ ...BASE_ITEM, userId: OTHER_USER_ID });
    const res = await updateItem(
      makePatchRequest(`http://localhost:3000/api/checklist-items/${ITEM_ID}`, {
        label: "Updated",
      }),
      { params: makeParams(ITEM_ID) }
    );
    expect(res.status).toBe(404);
  });

  it("updates item successfully", async () => {
    mockItemFindUnique.mockResolvedValue(BASE_ITEM);
    const updated = { ...BASE_ITEM, label: "Updated label", isActive: false };
    mockItemUpdate.mockResolvedValue(updated);
    const res = await updateItem(
      makePatchRequest(`http://localhost:3000/api/checklist-items/${ITEM_ID}`, {
        label: "Updated label",
        isActive: false,
      }),
      { params: makeParams(ITEM_ID) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: typeof updated };
    expect(body.item.label).toBe("Updated label");
    expect(body.item.isActive).toBe(false);
  });
});

// ── DELETE /api/checklist-items/[id] ─────────────────────────────────────────

describe("DELETE /api/checklist-items/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await deleteItem(
      makeDeleteRequest(`http://localhost:3000/api/checklist-items/${ITEM_ID}`),
      { params: makeParams(ITEM_ID) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await deleteItem(
      makeDeleteRequest(`http://localhost:3000/api/checklist-items/${ITEM_ID}`),
      { params: makeParams(ITEM_ID) }
    );
    expect(res.status).toBe(429);
  });

  it("returns 404 when item not found", async () => {
    mockItemFindUnique.mockResolvedValue(null);
    const res = await deleteItem(
      makeDeleteRequest(`http://localhost:3000/api/checklist-items/${ITEM_ID}`),
      { params: makeParams(ITEM_ID) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when item belongs to another user", async () => {
    mockItemFindUnique.mockResolvedValue({ ...BASE_ITEM, userId: OTHER_USER_ID });
    const res = await deleteItem(
      makeDeleteRequest(`http://localhost:3000/api/checklist-items/${ITEM_ID}`),
      { params: makeParams(ITEM_ID) }
    );
    expect(res.status).toBe(404);
  });

  it("deletes item successfully", async () => {
    mockItemFindUnique.mockResolvedValue(BASE_ITEM);
    mockItemDelete.mockResolvedValue(BASE_ITEM);
    const res = await deleteItem(
      makeDeleteRequest(`http://localhost:3000/api/checklist-items/${ITEM_ID}`),
      { params: makeParams(ITEM_ID) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    expect(mockItemDelete).toHaveBeenCalledWith({ where: { id: ITEM_ID } });
  });
});

// ── GET /api/posts/[id]/checklist ─────────────────────────────────────────────

describe("GET /api/posts/[id]/checklist", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getPostChecklist(
      new NextRequest(`http://localhost:3000/api/posts/${POST_ID}/checklist`),
      { params: makeParams(POST_ID) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await getPostChecklist(
      new NextRequest(`http://localhost:3000/api/posts/${POST_ID}/checklist`),
      { params: makeParams(POST_ID) }
    );
    expect(res.status).toBe(429);
  });

  it("returns 404 when post not found", async () => {
    mockPostFindUnique.mockResolvedValue(null);
    const res = await getPostChecklist(
      new NextRequest(`http://localhost:3000/api/posts/${POST_ID}/checklist`),
      { params: makeParams(POST_ID) }
    );
    expect(res.status).toBe(404);
  });

  it("returns items and empty checks when no record exists", async () => {
    mockPostFindUnique.mockResolvedValue({ userId: MOCK_USER_ID });
    mockItemFindMany.mockResolvedValue([BASE_ITEM]);
    mockRecordFindUnique.mockResolvedValue(null);
    const res = await getPostChecklist(
      new NextRequest(`http://localhost:3000/api/posts/${POST_ID}/checklist`),
      { params: makeParams(POST_ID) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: typeof BASE_ITEM[];
      checks: Record<string, boolean>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.checks).toEqual({});
  });

  it("returns existing checks from record", async () => {
    mockPostFindUnique.mockResolvedValue({ userId: MOCK_USER_ID });
    mockItemFindMany.mockResolvedValue([BASE_ITEM]);
    mockRecordFindUnique.mockResolvedValue({ checks: { [ITEM_ID]: true } });
    const res = await getPostChecklist(
      new NextRequest(`http://localhost:3000/api/posts/${POST_ID}/checklist`),
      { params: makeParams(POST_ID) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: typeof BASE_ITEM[];
      checks: Record<string, boolean>;
    };
    expect(body.checks[ITEM_ID]).toBe(true);
  });
});

// ── PUT /api/posts/[id]/checklist ─────────────────────────────────────────────

describe("PUT /api/posts/[id]/checklist", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await putPostChecklist(
      makePutRequest(`http://localhost:3000/api/posts/${POST_ID}/checklist`, {
        checks: {},
      }),
      { params: makeParams(POST_ID) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await putPostChecklist(
      makePutRequest(`http://localhost:3000/api/posts/${POST_ID}/checklist`, {
        checks: {},
      }),
      { params: makeParams(POST_ID) }
    );
    expect(res.status).toBe(429);
  });

  it("returns 404 when post not found", async () => {
    mockPostFindUnique.mockResolvedValue(null);
    const res = await putPostChecklist(
      makePutRequest(`http://localhost:3000/api/posts/${POST_ID}/checklist`, {
        checks: {},
      }),
      { params: makeParams(POST_ID) }
    );
    expect(res.status).toBe(404);
  });

  it("upserts checklist record successfully", async () => {
    mockPostFindUnique.mockResolvedValue({ userId: MOCK_USER_ID });
    const record = {
      id: "rec1",
      postId: POST_ID,
      checks: { [ITEM_ID]: true },
      updatedAt: new Date(),
    };
    mockRecordUpsert.mockResolvedValue(record);
    const res = await putPostChecklist(
      makePutRequest(`http://localhost:3000/api/posts/${POST_ID}/checklist`, {
        checks: { [ITEM_ID]: true },
      }),
      { params: makeParams(POST_ID) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { record: typeof record };
    expect(body.record.checks).toEqual({ [ITEM_ID]: true });
    expect(mockRecordUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId: POST_ID },
        create: expect.objectContaining({
          postId: POST_ID,
          userId: MOCK_USER_ID,
          checks: { [ITEM_ID]: true },
        }),
      })
    );
  });
});
