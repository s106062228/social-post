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

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findUnique: jest.fn(),
    },
    shareLink: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import {
  POST as sharePOST,
  DELETE as shareDELETE,
} from "@/app/api/posts/[id]/share/route";
import { GET as publicGET } from "@/app/api/share/[token]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockShareLinkFindUnique = prisma.shareLink.findUnique as jest.Mock;
const mockShareLinkCreate = prisma.shareLink.create as jest.Mock;
const mockShareLinkDeleteMany = prisma.shareLink.deleteMany as jest.Mock;
const mockShareLinkUpdate = prisma.shareLink.update as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const SHARE_TOKEN = "share-token-abc123";

const SAMPLE_SHARE_LINK = {
  id: "sl-abc",
  postId: POST_ID,
  userId: MOCK_USER_ID,
  token: SHARE_TOKEN,
  expiresAt: null,
  views: 5,
  createdAt: new Date("2026-04-26T00:00:00Z"),
};

const SAMPLE_POST = {
  id: POST_ID,
  content: "Hello world! #test",
  mediaType: "NONE",
  mediaUrls: [],
  status: "PUBLISHED",
  scheduledAt: null,
  createdAt: new Date("2026-04-25T00:00:00Z"),
  publishResults: [{ platform: "FACEBOOK", status: "PUBLISHED", publishedUrl: null, publishedAt: null }],
};

function makeShareRequest(postId: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/posts/${postId}/share`, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

function makeDeleteRequest(postId: string): NextRequest {
  return new NextRequest(`http://localhost/api/posts/${postId}/share`, {
    method: "DELETE",
  });
}

function makePublicRequest(token: string): NextRequest {
  return new NextRequest(`http://localhost/api/share/${token}`);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── POST /api/posts/[id]/share ────────────────────────────────────────────────

describe("POST /api/posts/[id]/share", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await sharePOST(makeShareRequest(POST_ID), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid post ID format", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await sharePOST(makeShareRequest("not-a-cuid"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue(null);
    const res = await sharePOST(makeShareRequest(POST_ID), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ id: POST_ID, userId: "other-user" });
    const res = await sharePOST(makeShareRequest(POST_ID), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns existing share link when one already exists", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ id: POST_ID, userId: MOCK_USER_ID });
    mockShareLinkFindUnique.mockResolvedValue(SAMPLE_SHARE_LINK);
    const res = await sharePOST(makeShareRequest(POST_ID), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { shareLink: typeof SAMPLE_SHARE_LINK };
    expect(data.shareLink.token).toBe(SHARE_TOKEN);
    expect(mockShareLinkCreate).not.toHaveBeenCalled();
  });

  it("creates a new share link and returns 201", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ id: POST_ID, userId: MOCK_USER_ID });
    mockShareLinkFindUnique.mockResolvedValue(null);
    mockShareLinkCreate.mockResolvedValue(SAMPLE_SHARE_LINK);
    const res = await sharePOST(makeShareRequest(POST_ID), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { shareLink: typeof SAMPLE_SHARE_LINK };
    expect(data.shareLink.token).toBe(SHARE_TOKEN);
    expect(mockShareLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ postId: POST_ID, userId: MOCK_USER_ID }),
      })
    );
  });

  it("passes expiresAt when provided", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ id: POST_ID, userId: MOCK_USER_ID });
    mockShareLinkFindUnique.mockResolvedValue(null);
    mockShareLinkCreate.mockResolvedValue({
      ...SAMPLE_SHARE_LINK,
      expiresAt: new Date("2026-12-31T00:00:00Z"),
    });
    const req = new NextRequest(`http://localhost/api/posts/${POST_ID}/share`, {
      method: "POST",
      body: JSON.stringify({ expiresAt: "2026-12-31T00:00:00Z" }),
      headers: { "content-type": "application/json" },
    });
    const res = await sharePOST(req, {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(201);
    expect(mockShareLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: new Date("2026-12-31T00:00:00Z"),
        }),
      })
    );
  });
});

// ── DELETE /api/posts/[id]/share ──────────────────────────────────────────────

describe("DELETE /api/posts/[id]/share", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await shareDELETE(makeDeleteRequest(POST_ID), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid post ID format", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await shareDELETE(makeDeleteRequest("not-a-cuid"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when no share link exists for this post+user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockShareLinkDeleteMany.mockResolvedValue({ count: 0 });
    const res = await shareDELETE(makeDeleteRequest(POST_ID), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("revokes share link and returns success", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockShareLinkDeleteMany.mockResolvedValue({ count: 1 });
    const res = await shareDELETE(makeDeleteRequest(POST_ID), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
    expect(mockShareLinkDeleteMany).toHaveBeenCalledWith({
      where: { postId: POST_ID, userId: MOCK_USER_ID },
    });
  });
});

// ── GET /api/share/[token] ────────────────────────────────────────────────────

describe("GET /api/share/[token]", () => {
  it("returns 404 when token not found", async () => {
    mockShareLinkFindUnique.mockResolvedValue(null);
    const res = await publicGET(makePublicRequest(SHARE_TOKEN), {
      params: Promise.resolve({ token: SHARE_TOKEN }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 410 when link has expired", async () => {
    mockShareLinkFindUnique.mockResolvedValue({
      ...SAMPLE_SHARE_LINK,
      post: SAMPLE_POST,
      expiresAt: new Date("2020-01-01T00:00:00Z"),
    });
    const res = await publicGET(makePublicRequest(SHARE_TOKEN), {
      params: Promise.resolve({ token: SHARE_TOKEN }),
    });
    expect(res.status).toBe(410);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/expired/i);
  });

  it("returns post data and increments view count on valid token", async () => {
    mockShareLinkFindUnique.mockResolvedValue({
      ...SAMPLE_SHARE_LINK,
      post: SAMPLE_POST,
    });
    mockShareLinkUpdate.mockResolvedValue({ ...SAMPLE_SHARE_LINK, views: 6 });
    const res = await publicGET(makePublicRequest(SHARE_TOKEN), {
      params: Promise.resolve({ token: SHARE_TOKEN }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      post: typeof SAMPLE_POST;
      views: number;
      expiresAt: null;
    };
    expect(data.post.content).toBe("Hello world! #test");
    expect(data.views).toBe(6);
    expect(data.expiresAt).toBeNull();
    expect(mockShareLinkUpdate).toHaveBeenCalledWith({
      where: { token: SHARE_TOKEN },
      data: { views: { increment: 1 } },
    });
  });

  it("does not require authentication", async () => {
    mockShareLinkFindUnique.mockResolvedValue({
      ...SAMPLE_SHARE_LINK,
      post: SAMPLE_POST,
    });
    mockShareLinkUpdate.mockResolvedValue({ ...SAMPLE_SHARE_LINK, views: 6 });
    const res = await publicGET(makePublicRequest(SHARE_TOKEN), {
      params: Promise.resolve({ token: SHARE_TOKEN }),
    });
    expect(res.status).toBe(200);
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it("returns post without user PII", async () => {
    mockShareLinkFindUnique.mockResolvedValue({
      ...SAMPLE_SHARE_LINK,
      post: SAMPLE_POST,
    });
    mockShareLinkUpdate.mockResolvedValue({ ...SAMPLE_SHARE_LINK, views: 6 });
    const res = await publicGET(makePublicRequest(SHARE_TOKEN), {
      params: Promise.resolve({ token: SHARE_TOKEN }),
    });
    const data = (await res.json()) as { post: Record<string, unknown> };
    expect(data.post).not.toHaveProperty("userId");
    expect(data.post).not.toHaveProperty("user");
  });
});
