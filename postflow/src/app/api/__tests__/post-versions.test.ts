jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
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
    post: { findUnique: jest.fn() },
    postVersion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/activity-log", () => ({ logActivity: jest.fn() }));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/posts/[id]/versions/route";
import { POST as restorePost } from "@/app/api/posts/[id]/versions/[versionId]/restore/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockVersionFindMany = prisma.postVersion.findMany as jest.Mock;
const mockVersionFindUnique = prisma.postVersion.findUnique as jest.Mock;
const mockVersionCreate = prisma.postVersion.create as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const VALID_VERSION_ID = "clh3ck8zp0002qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const MOCK_POST = {
  id: VALID_POST_ID,
  userId: MOCK_USER_ID,
  content: "Hello world",
  mediaType: "NONE",
  mediaUrls: [],
  status: "DRAFT",
};

const MOCK_VERSION = {
  id: VALID_VERSION_ID,
  postId: VALID_POST_ID,
  content: "Old content",
  mediaType: "NONE",
  mediaUrls: [],
  createdAt: new Date("2026-04-20T10:00:00Z"),
};

function makeRequest(
  path: string,
  method = "GET"
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { method });
}

// ── GET /api/posts/[id]/versions ───────────────────────────────────────────────

describe("GET /api/posts/[id]/versions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest(`/api/posts/${VALID_POST_ID}/versions`), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid cuid", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await GET(makeRequest("/api/posts/not-a-cuid/versions"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(`/api/posts/${VALID_POST_ID}/versions`), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ userId: OTHER_USER_ID });
    const res = await GET(makeRequest(`/api/posts/${VALID_POST_ID}/versions`), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns versions list", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ userId: MOCK_USER_ID });
    mockVersionFindMany.mockResolvedValue([MOCK_VERSION]);
    const res = await GET(makeRequest(`/api/posts/${VALID_POST_ID}/versions`), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { versions: unknown[] };
    expect(data.versions).toHaveLength(1);
    expect(mockVersionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId: VALID_POST_ID },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    );
  });

  it("returns empty array when no versions exist", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ userId: MOCK_USER_ID });
    mockVersionFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest(`/api/posts/${VALID_POST_ID}/versions`), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { versions: unknown[] };
    expect(data.versions).toHaveLength(0);
  });
});

// ── POST /api/posts/[id]/versions (snapshot) ───────────────────────────────────

describe("POST /api/posts/[id]/versions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(`/api/posts/${VALID_POST_ID}/versions`, "POST"), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(`/api/posts/${VALID_POST_ID}/versions`, "POST"), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 for published post", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ ...MOCK_POST, status: "PUBLISHED" });
    const res = await POST(makeRequest(`/api/posts/${VALID_POST_ID}/versions`, "POST"), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(409);
  });

  it("creates a version snapshot for a draft post", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue(MOCK_POST);
    mockVersionCreate.mockResolvedValue({ ...MOCK_VERSION, id: "new-version-id" });
    const res = await POST(makeRequest(`/api/posts/${VALID_POST_ID}/versions`, "POST"), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(201);
    expect(mockVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          postId: VALID_POST_ID,
          userId: MOCK_USER_ID,
          content: MOCK_POST.content,
        }),
      })
    );
  });
});

// ── POST /api/posts/[id]/versions/[versionId]/restore ─────────────────────────

describe("POST /api/posts/[id]/versions/[versionId]/restore", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await restorePost(
      makeRequest(`/api/posts/${VALID_POST_ID}/versions/${VALID_VERSION_ID}/restore`, "POST"),
      { params: Promise.resolve({ id: VALID_POST_ID, versionId: VALID_VERSION_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid cuid params", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await restorePost(
      makeRequest("/api/posts/bad/versions/bad/restore", "POST"),
      { params: Promise.resolve({ id: "bad", versionId: "bad" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue(null);
    const res = await restorePost(
      makeRequest(`/api/posts/${VALID_POST_ID}/versions/${VALID_VERSION_ID}/restore`, "POST"),
      { params: Promise.resolve({ id: VALID_POST_ID, versionId: VALID_VERSION_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when post is published", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ ...MOCK_POST, status: "PUBLISHED" });
    const res = await restorePost(
      makeRequest(`/api/posts/${VALID_POST_ID}/versions/${VALID_VERSION_ID}/restore`, "POST"),
      { params: Promise.resolve({ id: VALID_POST_ID, versionId: VALID_VERSION_ID }) }
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 when version not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue(MOCK_POST);
    mockVersionFindUnique.mockResolvedValue(null);
    const res = await restorePost(
      makeRequest(`/api/posts/${VALID_POST_ID}/versions/${VALID_VERSION_ID}/restore`, "POST"),
      { params: Promise.resolve({ id: VALID_POST_ID, versionId: VALID_VERSION_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when version belongs to a different post", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue(MOCK_POST);
    mockVersionFindUnique.mockResolvedValue({
      ...MOCK_VERSION,
      postId: "clh3ck8zp0099qr5hyvxckahk",
    });
    const res = await restorePost(
      makeRequest(`/api/posts/${VALID_POST_ID}/versions/${VALID_VERSION_ID}/restore`, "POST"),
      { params: Promise.resolve({ id: VALID_POST_ID, versionId: VALID_VERSION_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("restores version and saves current as new version", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue(MOCK_POST);
    mockVersionFindUnique.mockResolvedValue({ ...MOCK_VERSION, postId: VALID_POST_ID });

    const updatedPost = {
      id: VALID_POST_ID,
      content: MOCK_VERSION.content,
      mediaType: "NONE",
      mediaUrls: [],
      status: "DRAFT",
      updatedAt: new Date(),
    };
    mockTransaction.mockResolvedValue([updatedPost, {}]);

    const res = await restorePost(
      makeRequest(`/api/posts/${VALID_POST_ID}/versions/${VALID_VERSION_ID}/restore`, "POST"),
      { params: Promise.resolve({ id: VALID_POST_ID, versionId: VALID_VERSION_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { content: string };
    expect(data.content).toBe(MOCK_VERSION.content);
    expect(mockTransaction).toHaveBeenCalled();
  });
});
