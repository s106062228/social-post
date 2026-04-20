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
      create: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/[id]/duplicate/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockPostCreate = prisma.post.create as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const BASE_POST = {
  id: VALID_POST_ID,
  userId: MOCK_USER_ID,
  content: "Hello world",
  mediaType: "NONE",
  mediaUrls: [],
  status: "PUBLISHED",
  scheduledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DUPLICATE_POST = {
  id: "clh3ck8zp0002qr5hyvxckahk",
  userId: MOCK_USER_ID,
  content: "Hello world",
  mediaType: "NONE",
  mediaUrls: [],
  status: "DRAFT",
  scheduledAt: null,
  publishResults: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(postId = VALID_POST_ID): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/duplicate`, {
    method: "POST",
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/posts/[id]/duplicate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("returns 404 when post ID is not a valid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await POST(makeRequest("not-a-cuid"), makeParams("not-a-cuid"));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  // ── Ownership ─────────────────────────────────────────────────────────────

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ ...BASE_POST, userId: OTHER_USER_ID });

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  // ── Successful duplication ────────────────────────────────────────────────

  it("returns 201 with a new DRAFT post copying the original content", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockPostCreate.mockResolvedValueOnce(DUPLICATE_POST);

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof DUPLICATE_POST;
    expect(data.status).toBe("DRAFT");
    expect(data.content).toBe(BASE_POST.content);
    expect(data.scheduledAt).toBeNull();
    expect(data.id).not.toBe(VALID_POST_ID);
  });

  it("creates the duplicate with DRAFT status regardless of original status", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ ...BASE_POST, status: "SCHEDULED" });
    mockPostCreate.mockResolvedValueOnce(DUPLICATE_POST);

    await POST(makeRequest(), makeParams(VALID_POST_ID));

    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          scheduledAt: null,
          content: BASE_POST.content,
        }),
      })
    );
  });

  it("copies mediaType and mediaUrls from the original", async () => {
    const imagePost = {
      ...BASE_POST,
      mediaType: "IMAGE",
      mediaUrls: ["https://example.com/image.jpg"],
    };
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(imagePost);
    mockPostCreate.mockResolvedValueOnce({
      ...DUPLICATE_POST,
      mediaType: "IMAGE",
      mediaUrls: ["https://example.com/image.jpg"],
    });

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(201);

    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mediaType: "IMAGE",
          mediaUrls: ["https://example.com/image.jpg"],
        }),
      })
    );
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockPostCreate.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await POST(makeRequest(), makeParams(VALID_POST_ID));
    expect(res.status).toBe(500);
  });
});
