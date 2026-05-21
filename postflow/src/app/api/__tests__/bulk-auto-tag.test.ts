jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
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
    post: { findMany: jest.fn() },
    tag: { findMany: jest.fn(), create: jest.fn() },
    postTag: { upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/ai", () => ({
  suggestTagsForContent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/bulk-auto-tag/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { suggestTagsForContent } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockTagFindMany = prisma.tag.findMany as jest.Mock;
const mockTagCreate = prisma.tag.create as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockSuggestTags = suggestTagsForContent as jest.Mock;

const USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED = { user: { id: USER_ID } };

const POST_ID_1 = "clh3ck8zp0001qr5hyvxckahk";
const POST_ID_2 = "clh3ck8zp0002qr5hyvxckahk";
const TAG_ID_1 = "clh3ck8zp0010qr5hyvxckahk";

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/posts/bulk-auto-tag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
  process.env.ANTHROPIC_API_KEY = "test-key";
  mockTransaction.mockImplementation(async (fns: unknown[]) =>
    Promise.all((fns as (() => Promise<unknown>)[]).map((fn) => fn()))
  );
});

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
});

describe("POST /api/posts/bulk-auto-tag", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue({ success: false });
    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI not configured", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    expect(res.status).toBe(503);
  });

  it("returns 400 on invalid JSON", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    const req = new NextRequest("http://localhost:3000/api/posts/bulk-auto-tag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty postIds", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    const res = await POST(makeRequest({ postIds: [] }));
    expect(res.status).toBe(400);
  });

  it("skips posts not owned by the user", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    // findMany only returns owned posts
    mockPostFindMany.mockResolvedValue([]);
    mockTagFindMany.mockResolvedValue([]);
    mockSuggestTags.mockResolvedValue([]);

    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tagged: number; created: number; skipped: number };
    expect(data.tagged).toBe(0);
    expect(data.skipped).toBe(0);
  });

  it("skips PUBLISHING posts", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockPostFindMany.mockResolvedValue([
      { id: POST_ID_1, content: "Test post", status: "PUBLISHING" },
    ]);
    mockTagFindMany.mockResolvedValue([]);
    mockSuggestTags.mockResolvedValue([]);

    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tagged: number; created: number; skipped: number };
    expect(data.skipped).toBe(1);
    expect(data.tagged).toBe(0);
    expect(mockSuggestTags).not.toHaveBeenCalled();
  });

  it("applies top N existing tags and returns tagged count", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockPostFindMany.mockResolvedValue([
      { id: POST_ID_1, content: "Tech post about React", status: "DRAFT" },
    ]);
    mockTagFindMany.mockResolvedValue([{ id: TAG_ID_1, name: "react" }]);
    mockSuggestTags.mockResolvedValue([
      { tagId: TAG_ID_1, name: "react", reason: "Relevant", isNew: false },
    ]);
    mockTransaction.mockResolvedValue([{}]);

    const res = await POST(makeRequest({ postIds: [POST_ID_1], applyTopN: 3 }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tagged: number; created: number; skipped: number };
    expect(data.tagged).toBe(1);
    expect(data.created).toBe(0);
  });

  it("creates new tags when suggestion is new", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockPostFindMany.mockResolvedValue([
      { id: POST_ID_1, content: "Post about innovation", status: "DRAFT" },
    ]);
    mockTagFindMany.mockResolvedValue([]);
    mockSuggestTags.mockResolvedValue([
      { tagId: undefined, name: "innovation", reason: "New concept", isNew: true },
    ]);
    const newTagId = "clh3ck8zp0099qr5hyvxckahk";
    mockTagCreate.mockResolvedValue({ id: newTagId, name: "innovation" });
    mockTransaction.mockResolvedValue([{}]);

    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tagged: number; created: number; skipped: number };
    expect(data.tagged).toBe(1);
    expect(data.created).toBe(1);
    expect(mockTagCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "innovation" }) })
    );
  });

  it("handles multiple posts and returns aggregate counts", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockPostFindMany.mockResolvedValue([
      { id: POST_ID_1, content: "Post 1", status: "DRAFT" },
      { id: POST_ID_2, content: "Post 2", status: "PUBLISHED" },
    ]);
    mockTagFindMany.mockResolvedValue([{ id: TAG_ID_1, name: "general" }]);
    mockSuggestTags.mockResolvedValue([
      { tagId: TAG_ID_1, name: "general", reason: "Relevant", isNew: false },
    ]);
    mockTransaction.mockResolvedValue([{}]);

    const res = await POST(
      makeRequest({ postIds: [POST_ID_1, POST_ID_2] })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tagged: number; created: number; skipped: number };
    expect(data.tagged).toBe(2);
  });

  it("skips post when AI returns no suggestions", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockPostFindMany.mockResolvedValue([
      { id: POST_ID_1, content: "??", status: "DRAFT" },
    ]);
    mockTagFindMany.mockResolvedValue([]);
    mockSuggestTags.mockResolvedValue([]);

    const res = await POST(makeRequest({ postIds: [POST_ID_1] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tagged: number; created: number; skipped: number };
    expect(data.skipped).toBe(1);
    expect(data.tagged).toBe(0);
  });
});
