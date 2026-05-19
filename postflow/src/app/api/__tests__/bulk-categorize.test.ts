jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  ContentCategory: {
    EDUCATIONAL: "EDUCATIONAL",
    PROMOTIONAL: "PROMOTIONAL",
    ENTERTAINING: "ENTERTAINING",
    ENGAGING: "ENGAGING",
    INSPIRING: "INSPIRING",
    NEWS: "NEWS",
    BEHIND_THE_SCENES: "BEHIND_THE_SCENES",
    USER_GENERATED: "USER_GENERATED",
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
    post: { updateMany: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/bulk-categorize/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostUpdateMany = prisma.post.updateMany as jest.Mock;

const USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED = { user: { id: USER_ID } };

const POST_ID_1 = "clh3ck8zp0001qr5hyvxckahk";
const POST_ID_2 = "clh3ck8zp0002qr5hyvxckahk";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/posts/bulk-categorize", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue({ success: true });
  mockPostUpdateMany.mockResolvedValue({ count: 2 });
});

describe("POST /api/posts/bulk-categorize", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ postIds: [POST_ID_1], contentCategory: "EDUCATIONAL" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false });
    const res = await POST(makeRequest({ postIds: [POST_ID_1], contentCategory: "EDUCATIONAL" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/posts/bulk-categorize", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid contentCategory value", async () => {
    const res = await POST(makeRequest({ postIds: [POST_ID_1], contentCategory: "INVALID_CATEGORY" }));
    expect(res.status).toBe(400);
  });

  it("sets a valid category on multiple posts", async () => {
    const res = await POST(makeRequest({
      postIds: [POST_ID_1, POST_ID_2],
      contentCategory: "EDUCATIONAL",
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number };
    expect(data.updated).toBe(2);
    expect(mockPostUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [POST_ID_1, POST_ID_2] }, userId: USER_ID },
      data: { contentCategory: "EDUCATIONAL" },
    });
  });

  it("clears category when contentCategory is null", async () => {
    mockPostUpdateMany.mockResolvedValue({ count: 1 });
    const res = await POST(makeRequest({ postIds: [POST_ID_1], contentCategory: null }));
    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number };
    expect(data.updated).toBe(1);
    expect(mockPostUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [POST_ID_1] }, userId: USER_ID },
      data: { contentCategory: null },
    });
  });

  it("returns 400 when postIds is empty", async () => {
    const res = await POST(makeRequest({ postIds: [], contentCategory: "NEWS" }));
    expect(res.status).toBe(400);
  });

  it("accepts all valid ContentCategory enum values", async () => {
    const categories = [
      "EDUCATIONAL", "PROMOTIONAL", "ENTERTAINING", "ENGAGING",
      "INSPIRING", "NEWS", "BEHIND_THE_SCENES", "USER_GENERATED",
    ];
    for (const cat of categories) {
      const res = await POST(makeRequest({ postIds: [POST_ID_1], contentCategory: cat }));
      expect(res.status).toBe(200);
    }
  });
});
