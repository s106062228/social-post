jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
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

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findUnique: jest.fn() },
    postVersion: { findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn().mockResolvedValue({ success: true, remaining: 99, reset: Date.now() }),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/posts/[id]/versions/diff/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockFindPost = prisma.post.findUnique as jest.Mock;
const mockFindVersion = prisma.postVersion.findFirst as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const USER_ID = "cluser0000000000000000001";
const OTHER_USER_ID = "cluser0000000000000000002";
const POST_ID = "clpost00000000000000000001";
const VERSION_A_ID = "clvera0000000000000000001";
const VERSION_B_ID = "clverb0000000000000000001";

const AUTHED_SESSION = { user: { id: USER_ID, email: "user@example.com" } };

const SAMPLE_POST = {
  userId: USER_ID,
  content: "Current post content here",
  updatedAt: new Date("2026-01-15T10:00:00Z"),
};

const VERSION_A = {
  id: VERSION_A_ID,
  content: "Hello world this is original",
  createdAt: new Date("2026-01-10T09:00:00Z"),
};

const VERSION_B = {
  id: VERSION_B_ID,
  content: "Hello world this is updated",
  createdAt: new Date("2026-01-12T09:00:00Z"),
};

function makeRequest(postId: string, from: string, to: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/posts/${postId}/versions/diff?from=${from}&to=${to}`,
    { method: "GET" }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockFindPost.mockResolvedValue(SAMPLE_POST);
  mockApiLimiter.mockResolvedValue({ success: true, remaining: 99, reset: Date.now() });
});

describe("GET /api/posts/[id]/versions/diff", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest(POST_ID, VERSION_A_ID, VERSION_B_ID);
    const res = await GET(req, { params: Promise.resolve({ id: POST_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() });
    const req = makeRequest(POST_ID, VERSION_A_ID, VERSION_B_ID);
    const res = await GET(req, { params: Promise.resolve({ id: POST_ID }) });
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid post ID", async () => {
    const req = makeRequest("not-a-cuid", VERSION_A_ID, VERSION_B_ID);
    const res = await GET(req, { params: Promise.resolve({ id: "not-a-cuid" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post not found", async () => {
    mockFindPost.mockResolvedValue(null);
    const req = makeRequest(POST_ID, VERSION_A_ID, VERSION_B_ID);
    const res = await GET(req, { params: Promise.resolve({ id: POST_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockFindPost.mockResolvedValue({ ...SAMPLE_POST, userId: OTHER_USER_ID });
    const req = makeRequest(POST_ID, VERSION_A_ID, VERSION_B_ID);
    const res = await GET(req, { params: Promise.resolve({ id: POST_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 400 when 'from' param is missing", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/posts/${POST_ID}/versions/diff?to=${VERSION_B_ID}`,
      { method: "GET" }
    );
    const res = await GET(req, { params: Promise.resolve({ id: POST_ID }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when 'to' param is missing", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/posts/${POST_ID}/versions/diff?from=${VERSION_A_ID}`,
      { method: "GET" }
    );
    const res = await GET(req, { params: Promise.resolve({ id: POST_ID }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid 'from' version ID", async () => {
    const req = makeRequest(POST_ID, "invalid-id", VERSION_B_ID);
    const res = await GET(req, { params: Promise.resolve({ id: POST_ID }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when from-version not found", async () => {
    mockFindVersion.mockResolvedValue(null);
    const req = makeRequest(POST_ID, VERSION_A_ID, VERSION_B_ID);
    const res = await GET(req, { params: Promise.resolve({ id: POST_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns diff between two versions", async () => {
    mockFindVersion
      .mockResolvedValueOnce(VERSION_A) // from
      .mockResolvedValueOnce(VERSION_B); // to
    const req = makeRequest(POST_ID, VERSION_A_ID, VERSION_B_ID);
    const res = await GET(req, { params: Promise.resolve({ id: POST_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      diff: { type: string; text: string }[];
      stats: { added: number; removed: number; unchanged: number };
      fromVersion: { id: string };
      toVersion: { id: string };
    };
    expect(Array.isArray(body.diff)).toBe(true);
    expect(body.stats).toHaveProperty("added");
    expect(body.stats).toHaveProperty("removed");
    expect(body.stats).toHaveProperty("unchanged");
    expect(body.fromVersion.id).toBe(VERSION_A_ID);
    expect(body.toVersion.id).toBe(VERSION_B_ID);
  });

  it("returns diff between version and current when to=current", async () => {
    mockFindVersion.mockResolvedValueOnce(VERSION_A); // only from is queried
    const req = makeRequest(POST_ID, VERSION_A_ID, "current");
    const res = await GET(req, { params: Promise.resolve({ id: POST_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      toVersion: { id: string };
    };
    expect(body.toVersion.id).toBe("current");
  });

  it("diff chunks reconstruct the 'after' content correctly", async () => {
    const from = { ...VERSION_A, content: "the quick brown fox" };
    const to = { ...VERSION_B, content: "the quick red fox jumps" };
    mockFindVersion
      .mockResolvedValueOnce(from)
      .mockResolvedValueOnce(to);
    const req = makeRequest(POST_ID, VERSION_A_ID, VERSION_B_ID);
    const res = await GET(req, { params: Promise.resolve({ id: POST_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      diff: { type: string; text: string }[];
    };
    // Reconstruct "after" from unchanged + added chunks
    const reconstructed = body.diff
      .filter((c) => c.type !== "removed")
      .map((c) => c.text)
      .join("");
    expect(reconstructed).toBe(to.content);
  });
});
