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
    draftAutosave: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import {
  GET as getAutosave,
  PUT as putAutosave,
  DELETE as deleteAutosave,
} from "@/app/api/posts/autosave/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindUnique = prisma.draftAutosave.findUnique as jest.Mock;
const mockUpsert = prisma.draftAutosave.upsert as jest.Mock;
const mockDeleteMany = prisma.draftAutosave.deleteMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_DRAFT = {
  id: "clh3ck8zp0001qr5hyvxckahk",
  content: "My draft post content",
  scheduledAt: null,
  firstComment: null,
  selectedAccountIds: [],
  tagIds: [],
  platformVariants: null,
  updatedAt: new Date("2026-01-01T10:00:00Z"),
};

function makePutRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/posts/autosave", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
});

// ── GET /api/posts/autosave ───────────────────────────────────────────────────

describe("GET /api/posts/autosave", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getAutosave();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await getAutosave();
    expect(res.status).toBe(429);
  });

  it("returns null draft when no autosave exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await getAutosave();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draft: null };
    expect(body.draft).toBeNull();
  });

  it("returns existing draft with correct shape", async () => {
    mockFindUnique.mockResolvedValue(BASE_DRAFT);
    const res = await getAutosave();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draft: typeof BASE_DRAFT };
    expect(body.draft).not.toBeNull();
    expect(body.draft.content).toBe("My draft post content");
    expect(body.draft.selectedAccountIds).toEqual([]);
    expect(body.draft.tagIds).toEqual([]);
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });
});

// ── PUT /api/posts/autosave ───────────────────────────────────────────────────

describe("PUT /api/posts/autosave", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await putAutosave(makePutRequest({ content: "hello" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await putAutosave(makePutRequest({ content: "hello" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for content exceeding max length", async () => {
    const res = await putAutosave(makePutRequest({ content: "x".repeat(65001) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for firstComment exceeding max length", async () => {
    const res = await putAutosave(
      makePutRequest({ content: "hello", firstComment: "x".repeat(2201) })
    );
    expect(res.status).toBe(400);
  });

  it("creates a new draft (upsert) and returns draft", async () => {
    mockUpsert.mockResolvedValue({ ...BASE_DRAFT, content: "hello world" });
    const res = await putAutosave(makePutRequest({ content: "hello world" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draft: { content: string } };
    expect(body.draft.content).toBe("hello world");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID },
        create: expect.objectContaining({ content: "hello world", userId: MOCK_USER_ID }),
        update: expect.objectContaining({ content: "hello world" }),
      })
    );
  });

  it("stores scheduledAt, firstComment, accountIds, tagIds", async () => {
    const scheduled = "2026-06-01T09:00:00.000Z";
    mockUpsert.mockResolvedValue({
      ...BASE_DRAFT,
      content: "Promo",
      scheduledAt: new Date(scheduled),
      firstComment: "See link in bio",
      selectedAccountIds: ["acc1"],
      tagIds: ["tag1"],
    });
    const res = await putAutosave(
      makePutRequest({
        content: "Promo",
        scheduledAt: scheduled,
        firstComment: "See link in bio",
        selectedAccountIds: ["acc1"],
        tagIds: ["tag1"],
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draft: { firstComment: string } };
    expect(body.draft.firstComment).toBe("See link in bio");
  });
});

// ── DELETE /api/posts/autosave ────────────────────────────────────────────────

describe("DELETE /api/posts/autosave", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await deleteAutosave();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await deleteAutosave();
    expect(res.status).toBe(429);
  });

  it("deletes the draft and returns ok", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });
    const res = await deleteAutosave();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });

  it("returns ok even when no draft existed", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });
    const res = await deleteAutosave();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
