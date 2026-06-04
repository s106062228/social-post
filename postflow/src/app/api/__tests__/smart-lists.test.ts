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
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
  },
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    smartList: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listSmartLists, POST as createSmartList } from "@/app/api/smart-lists/route";
import { PATCH as updateSmartList, DELETE as deleteSmartList } from "@/app/api/smart-lists/[id]/route";
import { GET as getSmartListPosts } from "@/app/api/smart-lists/[id]/posts/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockSmartListFindMany = prisma.smartList.findMany as jest.Mock;
const mockSmartListFindUnique = prisma.smartList.findUnique as jest.Mock;
const mockSmartListCreate = prisma.smartList.create as jest.Mock;
const mockSmartListUpdate = prisma.smartList.update as jest.Mock;
const mockSmartListDelete = prisma.smartList.delete as jest.Mock;
const mockSmartListCount = prisma.smartList.count as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockPostCount = prisma.post.count as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_LIST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_SMART_LIST = {
  id: VALID_LIST_ID,
  userId: MOCK_USER_ID,
  name: "Starred Drafts",
  description: "All my starred draft posts",
  filters: { statuses: ["DRAFT"], starred: true },
  pinned: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "DELETE" });
}

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

// ── GET /api/smart-lists ──────────────────────────────────────────────────────

describe("GET /api/smart-lists", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listSmartLists();
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listSmartLists();
    expect(res.status).toBe(429);
  });

  it("returns empty smart lists array when none exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindMany.mockResolvedValueOnce([]);

    const res = await listSmartLists();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { smartLists: unknown[] };
    expect(Array.isArray(data.smartLists)).toBe(true);
    expect(data.smartLists).toHaveLength(0);
  });

  it("returns list of smart lists with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindMany.mockResolvedValueOnce([BASE_SMART_LIST]);

    const res = await listSmartLists();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { smartLists: typeof BASE_SMART_LIST[] };
    expect(data.smartLists).toHaveLength(1);
    expect(data.smartLists[0].name).toBe("Starred Drafts");
    expect(data.smartLists[0].description).toBe("All my starred draft posts");
    expect(data.smartLists[0].filters).toEqual({ statuses: ["DRAFT"], starred: true });
    expect(data.smartLists[0].pinned).toBe(false);
  });
});

// ── POST /api/smart-lists ─────────────────────────────────────────────────────

describe("POST /api/smart-lists", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createSmartList(
      makePostRequest("http://localhost:3000/api/smart-lists", {
        name: "My List",
        filters: {},
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createSmartList(
      makePostRequest("http://localhost:3000/api/smart-lists", {
        name: "My List",
        filters: {},
      })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createSmartList(
      makePostRequest("http://localhost:3000/api/smart-lists", { filters: {} })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 422 when max smart list limit reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListCount.mockResolvedValueOnce(20);

    const res = await createSmartList(
      makePostRequest("http://localhost:3000/api/smart-lists", {
        name: "One More List",
        filters: {},
      })
    );
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Maximum/);
  });

  it("creates smart list and returns 201 with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListCount.mockResolvedValueOnce(0);
    mockSmartListCreate.mockResolvedValueOnce(BASE_SMART_LIST);

    const res = await createSmartList(
      makePostRequest("http://localhost:3000/api/smart-lists", {
        name: "Starred Drafts",
        filters: { statuses: ["DRAFT"], starred: true },
      })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_SMART_LIST;
    expect(data.name).toBe("Starred Drafts");
    expect(data.filters).toEqual({ statuses: ["DRAFT"], starred: true });
  });
});

// ── PATCH /api/smart-lists/[id] ───────────────────────────────────────────────

describe("PATCH /api/smart-lists/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateSmartList(
      makePatchRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}`, { name: "New Name" }),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when smart list belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce({ ...BASE_SMART_LIST, userId: OTHER_USER_ID });

    const res = await updateSmartList(
      makePatchRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}`, { name: "New Name" }),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("updates name and returns updated smart list", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce(BASE_SMART_LIST);
    const updated = { ...BASE_SMART_LIST, name: "Updated Name" };
    mockSmartListUpdate.mockResolvedValueOnce(updated);

    const res = await updateSmartList(
      makePatchRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}`, { name: "Updated Name" }),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { smartList: typeof updated };
    expect(data.smartList.name).toBe("Updated Name");
  });

  it("updates pinned status", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce(BASE_SMART_LIST);
    const updated = { ...BASE_SMART_LIST, pinned: true };
    mockSmartListUpdate.mockResolvedValueOnce(updated);

    const res = await updateSmartList(
      makePatchRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}`, { pinned: true }),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { smartList: typeof updated };
    expect(data.smartList.pinned).toBe(true);
  });

  it("updates filters", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce(BASE_SMART_LIST);
    const newFilters = { statuses: ["PUBLISHED"], platforms: ["FACEBOOK"] };
    const updated = { ...BASE_SMART_LIST, filters: newFilters };
    mockSmartListUpdate.mockResolvedValueOnce(updated);

    const res = await updateSmartList(
      makePatchRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}`, { filters: newFilters }),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { smartList: typeof updated };
    expect(data.smartList.filters).toEqual(newFilters);
  });
});

// ── DELETE /api/smart-lists/[id] ──────────────────────────────────────────────

describe("DELETE /api/smart-lists/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteSmartList(
      makeDeleteRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when smart list not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce(null);

    const res = await deleteSmartList(
      makeDeleteRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when smart list belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce({ ...BASE_SMART_LIST, userId: OTHER_USER_ID });

    const res = await deleteSmartList(
      makeDeleteRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce(BASE_SMART_LIST);
    mockSmartListDelete.mockResolvedValueOnce(BASE_SMART_LIST);

    const res = await deleteSmartList(
      makeDeleteRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(204);
  });
});

// ── GET /api/smart-lists/[id]/posts ──────────────────────────────────────────

describe("GET /api/smart-lists/[id]/posts", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getSmartListPosts(
      makeGetRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}/posts`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await getSmartListPosts(
      makeGetRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}/posts`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(429);
  });

  it("returns 404 when smart list not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce(null);

    const res = await getSmartListPosts(
      makeGetRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}/posts`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when smart list belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce({ ...BASE_SMART_LIST, userId: OTHER_USER_ID });

    const res = await getSmartListPosts(
      makeGetRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}/posts`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns posts with pagination shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce(BASE_SMART_LIST);

    const mockPost = {
      id: "post1",
      userId: MOCK_USER_ID,
      content: "Test post",
      status: "DRAFT",
      mediaType: "NONE",
      publishResults: [],
      tags: [],
      workflowStage: null,
    };
    mockPostFindMany.mockResolvedValueOnce([mockPost]);
    mockPostCount.mockResolvedValueOnce(1);

    const res = await getSmartListPosts(
      makeGetRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}/posts`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      posts: unknown[];
      total: number;
      smartList: { id: string; name: string };
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };
    expect(Array.isArray(data.posts)).toBe(true);
    expect(data.posts).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.smartList.id).toBe(VALID_LIST_ID);
    expect(data.smartList.name).toBe("Starred Drafts");
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.total).toBe(1);
    expect(data.pagination.totalPages).toBe(1);
  });

  it("applies statuses filter from smart list", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce({
      ...BASE_SMART_LIST,
      filters: { statuses: ["DRAFT", "SCHEDULED"] },
    });
    mockPostFindMany.mockResolvedValueOnce([]);
    mockPostCount.mockResolvedValueOnce(0);

    const res = await getSmartListPosts(
      makeGetRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}/posts`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(res.status).toBe(200);
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["DRAFT", "SCHEDULED"] },
        }),
      })
    );
  });

  it("applies contentContains filter from smart list", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce({
      ...BASE_SMART_LIST,
      filters: { contentContains: "hello world" },
    });
    mockPostFindMany.mockResolvedValueOnce([]);
    mockPostCount.mockResolvedValueOnce(0);

    await getSmartListPosts(
      makeGetRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}/posts`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          content: { contains: "hello world", mode: "insensitive" },
        }),
      })
    );
  });

  it("applies starred filter from smart list", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockSmartListFindUnique.mockResolvedValueOnce({
      ...BASE_SMART_LIST,
      filters: { starred: true },
    });
    mockPostFindMany.mockResolvedValueOnce([]);
    mockPostCount.mockResolvedValueOnce(0);

    await getSmartListPosts(
      makeGetRequest(`http://localhost:3000/api/smart-lists/${VALID_LIST_ID}/posts`),
      { params: Promise.resolve({ id: VALID_LIST_ID }) }
    );
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          starred: true,
        }),
      })
    );
  });
});
