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
    tag: { findMany: jest.fn() },
    post: { findMany: jest.fn() },
    postTag: { createMany: jest.fn(), deleteMany: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/bulk-tag/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockTagFindMany = prisma.tag.findMany as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockPostTagCreateMany = prisma.postTag.createMany as jest.Mock;
const mockPostTagDeleteMany = prisma.postTag.deleteMany as jest.Mock;

const USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED = { user: { id: USER_ID } };

const POST_ID_1 = "clh3ck8zp0001qr5hyvxckahk";
const POST_ID_2 = "clh3ck8zp0002qr5hyvxckahk";
const TAG_ID_1 = "clh3ck8zp0003qr5hyvxckahk";
const TAG_ID_2 = "clh3ck8zp0004qr5hyvxckahk";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/posts/bulk-tag", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue({ success: true });
  mockTagFindMany.mockResolvedValue([{ id: TAG_ID_1 }, { id: TAG_ID_2 }]);
  mockPostFindMany.mockResolvedValue([
    { id: POST_ID_1, status: "DRAFT" },
    { id: POST_ID_2, status: "PUBLISHED" },
  ]);
  mockPostTagCreateMany.mockResolvedValue({ count: 4 });
  mockPostTagDeleteMany.mockResolvedValue({ count: 4 });
});

describe("POST /api/posts/bulk-tag", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ postIds: [POST_ID_1], tagIds: [TAG_ID_1], action: "add" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false });
    const res = await POST(makeRequest({ postIds: [POST_ID_1], tagIds: [TAG_ID_1], action: "add" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/posts/bulk-tag", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing action", async () => {
    const res = await POST(makeRequest({ postIds: [POST_ID_1], tagIds: [TAG_ID_1] }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when a tag doesn't belong to the user", async () => {
    mockTagFindMany.mockResolvedValue([{ id: TAG_ID_1 }]); // only 1 found, 2 requested
    const res = await POST(makeRequest({ postIds: [POST_ID_1], tagIds: [TAG_ID_1, TAG_ID_2], action: "add" }));
    expect(res.status).toBe(404);
  });

  it("adds tags to eligible posts and skips PUBLISHING", async () => {
    mockPostFindMany.mockResolvedValue([
      { id: POST_ID_1, status: "DRAFT" },
      { id: POST_ID_2, status: "PUBLISHING" },
    ]);
    mockTagFindMany.mockResolvedValue([{ id: TAG_ID_1 }]);

    const res = await POST(makeRequest({ postIds: [POST_ID_1, POST_ID_2], tagIds: [TAG_ID_1], action: "add" }));
    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number; skipped: number };
    expect(data.updated).toBe(1);
    expect(data.skipped).toBe(1);
    expect(mockPostTagCreateMany).toHaveBeenCalledWith({
      data: [{ postId: POST_ID_1, tagId: TAG_ID_1 }],
      skipDuplicates: true,
    });
  });

  it("removes tags from eligible posts", async () => {
    mockTagFindMany.mockResolvedValue([{ id: TAG_ID_1 }]);
    mockPostFindMany.mockResolvedValue([{ id: POST_ID_1, status: "DRAFT" }]);

    const res = await POST(makeRequest({ postIds: [POST_ID_1], tagIds: [TAG_ID_1], action: "remove" }));
    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number; skipped: number };
    expect(data.updated).toBe(1);
    expect(data.skipped).toBe(0);
    expect(mockPostTagDeleteMany).toHaveBeenCalledWith({
      where: { postId: { in: [POST_ID_1] }, tagId: { in: [TAG_ID_1] } },
    });
  });

  it("returns updated=0 and skips all when all posts are PUBLISHING", async () => {
    mockTagFindMany.mockResolvedValue([{ id: TAG_ID_1 }]);
    mockPostFindMany.mockResolvedValue([{ id: POST_ID_1, status: "PUBLISHING" }]);

    const res = await POST(makeRequest({ postIds: [POST_ID_1], tagIds: [TAG_ID_1], action: "add" }));
    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number; skipped: number };
    expect(data.updated).toBe(0);
    expect(data.skipped).toBe(1);
    expect(mockPostTagCreateMany).not.toHaveBeenCalled();
  });

  it("adds tags to multiple posts with multiple tags", async () => {
    mockTagFindMany.mockResolvedValue([{ id: TAG_ID_1 }, { id: TAG_ID_2 }]);
    mockPostFindMany.mockResolvedValue([
      { id: POST_ID_1, status: "DRAFT" },
      { id: POST_ID_2, status: "PUBLISHED" },
    ]);

    const res = await POST(makeRequest({ postIds: [POST_ID_1, POST_ID_2], tagIds: [TAG_ID_1, TAG_ID_2], action: "add" }));
    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number; skipped: number };
    expect(data.updated).toBe(2);
    expect(data.skipped).toBe(0);
    expect(mockPostTagCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        { postId: POST_ID_1, tagId: TAG_ID_1 },
        { postId: POST_ID_1, tagId: TAG_ID_2 },
        { postId: POST_ID_2, tagId: TAG_ID_1 },
        { postId: POST_ID_2, tagId: TAG_ID_2 },
      ]),
      skipDuplicates: true,
    });
  });
});
