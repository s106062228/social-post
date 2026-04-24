jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
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

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    postVersion: {
      create: jest.fn(),
    },
    publishResult: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { GET, PATCH, DELETE } from "@/app/api/posts/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.post.findUnique as jest.Mock;
const mockUpdate = prisma.post.update as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0099qr5hyvxckahk";
const VALID_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID } };

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(
  method = "GET",
  body?: unknown
): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${VALID_POST_ID}`, {
    method,
    ...(body !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
}

const BASE_POST = {
  id: VALID_POST_ID,
  userId: MOCK_USER_ID,
  content: "Hello world",
  mediaType: "NONE",
  mediaUrls: [],
  status: "DRAFT",
  scheduledAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("GET /api/posts/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 for an invalid CUID format", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await GET(makeRequest(), makeParams("not-a-cuid"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to a different user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_POST, userId: OTHER_USER_ID });
    const res = await GET(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 with post when found and owned by user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const postWithResults = { ...BASE_POST, publishResults: [] };
    mockFindUnique.mockResolvedValueOnce(postWithResults);

    const res = await GET(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; content: string };
    expect(data.id).toBe(VALID_POST_ID);
    expect(data.content).toBe("Hello world");
  });
});

describe("PATCH /api/posts/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest("PATCH", { content: "new" }), makeParams(VALID_POST_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest("PATCH", { content: "new" }), makeParams(VALID_POST_ID));
    expect(res.status).toBe(404);
  });

  it("returns 409 when post is already published", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHED" });
    const res = await PATCH(makeRequest("PATCH", { content: "new" }), makeParams(VALID_POST_ID));
    expect(res.status).toBe(409);
  });

  it("returns 409 when post is currently publishing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" });
    const res = await PATCH(makeRequest("PATCH", { content: "new" }), makeParams(VALID_POST_ID));
    expect(res.status).toBe(409);
  });

  it("returns 400 for empty update body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(BASE_POST);
    const res = await PATCH(makeRequest("PATCH", {}), makeParams(VALID_POST_ID));
    expect(res.status).toBe(400);
  });

  it("updates and returns the post on valid input (content change uses $transaction)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(BASE_POST);
    const updated = { ...BASE_POST, content: "Updated content", publishResults: [] };
    // Content changes → snapshot is saved → $transaction is used
    mockTransaction.mockResolvedValueOnce([updated, {}]);

    const res = await PATCH(makeRequest("PATCH", { content: "Updated content" }), makeParams(VALID_POST_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { content: string };
    expect(data.content).toBe("Updated content");
  });

  it("sets status to SCHEDULED when scheduledAt is provided without explicit status", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(BASE_POST);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const updated = { ...BASE_POST, status: "SCHEDULED", scheduledAt: future, publishResults: [] };
    mockUpdate.mockResolvedValueOnce(updated);

    await PATCH(makeRequest("PATCH", { scheduledAt: future }), makeParams(VALID_POST_ID));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SCHEDULED" }),
      })
    );
  });
});

describe("DELETE /api/posts/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await DELETE(makeRequest("DELETE"), makeParams(VALID_POST_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await DELETE(makeRequest("DELETE"), makeParams(VALID_POST_ID));
    expect(res.status).toBe(404);
  });

  it("returns 409 when post is currently publishing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_POST, status: "PUBLISHING" });
    const res = await DELETE(makeRequest("DELETE"), makeParams(VALID_POST_ID));
    expect(res.status).toBe(409);
  });

  it("returns 204 and deletes the post and its publish results", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(BASE_POST);
    mockTransaction.mockResolvedValueOnce([{ count: 0 }, BASE_POST]);

    const res = await DELETE(makeRequest("DELETE"), makeParams(VALID_POST_ID));
    expect(res.status).toBe(204);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
