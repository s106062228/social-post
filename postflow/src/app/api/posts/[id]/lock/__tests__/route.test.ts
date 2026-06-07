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
    postLock: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "@/app/api/posts/[id]/lock/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindUnique = prisma.postLock.findUnique as jest.Mock;
const mockUpsert = prisma.postLock.upsert as jest.Mock;
const mockDelete = prisma.postLock.delete as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0001qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const FUTURE_EXPIRY = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
const PAST_EXPIRY = new Date(Date.now() - 1000); // expired

const MOCK_LOCK = {
  postId: MOCK_POST_ID,
  userId: MOCK_USER_ID,
  lockedAt: new Date(),
  expiresAt: FUTURE_EXPIRY,
  user: { id: MOCK_USER_ID, name: "Test User", email: "user@example.com" },
};

const OTHER_LOCK = {
  ...MOCK_LOCK,
  userId: OTHER_USER_ID,
  user: { id: OTHER_USER_ID, name: "Other User", email: "other@example.com" },
};

function makeRequest(method = "GET") {
  return new NextRequest(`http://localhost:3000/api/posts/${MOCK_POST_ID}/lock`, { method });
}

const routeParams = { params: Promise.resolve({ id: MOCK_POST_ID }) };
const invalidParams = { params: Promise.resolve({ id: "not-a-cuid" }) };

describe("GET /api/posts/[id]/lock", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns locked:false when no lock exists", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), routeParams);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { locked: boolean };
    expect(data.locked).toBe(false);
  });

  it("returns locked:false and deletes expired lock", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...MOCK_LOCK, expiresAt: PAST_EXPIRY });
    mockDelete.mockResolvedValueOnce({});
    const res = await GET(makeRequest(), routeParams);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { locked: boolean };
    expect(data.locked).toBe(false);
    expect(mockDelete).toHaveBeenCalledWith({ where: { postId: MOCK_POST_ID } });
  });

  it("returns locked:true with lockedBy and expiresAt when lock is active", async () => {
    mockFindUnique.mockResolvedValueOnce(MOCK_LOCK);
    const res = await GET(makeRequest(), routeParams);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { locked: boolean; lockedBy: { id: string; name: string }; expiresAt: string };
    expect(data.locked).toBe(true);
    expect(data.lockedBy.id).toBe(MOCK_USER_ID);
    expect(data.lockedBy.name).toBe("Test User");
    expect(typeof data.expiresAt).toBe("string");
  });
});

describe("POST /api/posts/[id]/lock", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest("POST"), routeParams);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest("POST"), routeParams);
    expect(res.status).toBe(429);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest("POST"), routeParams);
    expect(res.status).toBe(404);
  });

  it("acquires lock successfully when no existing lock", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: MOCK_USER_ID });
    mockFindUnique.mockResolvedValueOnce(null);
    mockUpsert.mockResolvedValueOnce(MOCK_LOCK);

    const res = await POST(makeRequest("POST"), routeParams);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { locked: boolean; lockedBy: { id: string }; expiresAt: string };
    expect(data.locked).toBe(true);
    expect(data.lockedBy.id).toBe(MOCK_USER_ID);
  });

  it("refreshes own existing lock", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: MOCK_USER_ID });
    mockFindUnique.mockResolvedValueOnce(MOCK_LOCK); // own active lock
    mockUpsert.mockResolvedValueOnce(MOCK_LOCK);

    const res = await POST(makeRequest("POST"), routeParams);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("returns 409 when lock is held by another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: OTHER_USER_ID });
    mockFindUnique.mockResolvedValueOnce(OTHER_LOCK);

    const res = await POST(makeRequest("POST"), routeParams);
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string; lockedBy: { id: string } };
    expect(data.lockedBy.id).toBe(OTHER_USER_ID);
  });
});

describe("DELETE /api/posts/[id]/lock", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await DELETE(makeRequest("DELETE"), routeParams);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await DELETE(makeRequest("DELETE"), routeParams);
    expect(res.status).toBe(429);
  });

  it("returns 404 when no lock exists", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await DELETE(makeRequest("DELETE"), routeParams);
    expect(res.status).toBe(404);
  });

  it("returns 403 when lock is held by another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID, expiresAt: FUTURE_EXPIRY });
    const res = await DELETE(makeRequest("DELETE"), routeParams);
    expect(res.status).toBe(403);
  });

  it("returns 204 and deletes lock when releasing own lock", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID, expiresAt: FUTURE_EXPIRY });
    mockDelete.mockResolvedValueOnce({});
    const res = await DELETE(makeRequest("DELETE"), routeParams);
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { postId: MOCK_POST_ID } });
  });
});
