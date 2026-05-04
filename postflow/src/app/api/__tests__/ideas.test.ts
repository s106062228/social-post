jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  IdeaStatus: {
    IDEA: "IDEA",
    RESEARCHING: "RESEARCHING",
    DRAFTING: "DRAFTING",
    REVIEW: "REVIEW",
    DONE: "DONE",
  },
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
  },
  MediaType: { NONE: "NONE" },
  PostStatus: { DRAFT: "DRAFT" },
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

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    contentIdea: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      create: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listIdeas, POST as createIdea } from "@/app/api/ideas/route";
import { PATCH as updateIdea, DELETE as deleteIdea } from "@/app/api/ideas/[id]/route";
import { POST as toPost } from "@/app/api/ideas/[id]/to-post/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.contentIdea.findMany as jest.Mock;
const mockFindUnique = prisma.contentIdea.findUnique as jest.Mock;
const mockCreate = prisma.contentIdea.create as jest.Mock;
const mockUpdate = prisma.contentIdea.update as jest.Mock;
const mockDelete = prisma.contentIdea.delete as jest.Mock;
const mockPostCreate = prisma.post.create as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_IDEA_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_IDEA = {
  id: VALID_IDEA_ID,
  userId: MOCK_USER_ID,
  title: "Summer Campaign Post",
  description: "A series about summer products",
  status: "IDEA",
  platform: null,
  notes: null,
  dueDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/ideas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/ideas/${id}`, {
    method: "DELETE",
  });
}

// ── GET /api/ideas ─────────────────────────────────────────────────────────────

describe("GET /api/ideas", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listIdeas();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listIdeas();
    expect(res.status).toBe(429);
  });

  it("returns ideas list", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_IDEA]);
    const res = await listIdeas();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ideas: typeof BASE_IDEA[] };
    expect(data.ideas).toHaveLength(1);
    expect(data.ideas[0].title).toBe("Summer Campaign Post");
  });

  it("returns empty list when no ideas", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await listIdeas();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ideas: unknown[] };
    expect(data.ideas).toHaveLength(0);
  });
});

// ── POST /api/ideas ────────────────────────────────────────────────────────────

describe("POST /api/ideas", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createIdea(makePostRequest("/api/ideas", { title: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createIdea(makePostRequest("/api/ideas", { title: "Test" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when title is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createIdea(makePostRequest("/api/ideas", { description: "no title" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is too long", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createIdea(
      makePostRequest("/api/ideas", { title: "x".repeat(201) })
    );
    expect(res.status).toBe(400);
  });

  it("creates idea with minimal body and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCreate.mockResolvedValueOnce(BASE_IDEA);
    const res = await createIdea(makePostRequest("/api/ideas", { title: "Summer Campaign Post" }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_IDEA;
    expect(data.title).toBe("Summer Campaign Post");
    expect(data.status).toBe("IDEA");
  });

  it("creates idea with platform and status", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const ideaWithPlatform = { ...BASE_IDEA, platform: "INSTAGRAM", status: "DRAFTING" };
    mockCreate.mockResolvedValueOnce(ideaWithPlatform);
    const res = await createIdea(
      makePostRequest("/api/ideas", {
        title: "IG Idea",
        platform: "INSTAGRAM",
        status: "DRAFTING",
      })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof ideaWithPlatform;
    expect(data.platform).toBe("INSTAGRAM");
    expect(data.status).toBe("DRAFTING");
  });
});

// ── PATCH /api/ideas/[id] ──────────────────────────────────────────────────────

describe("PATCH /api/ideas/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateIdea(makePatchRequest(VALID_IDEA_ID, { status: "RESEARCHING" }), {
      params: Promise.resolve({ id: VALID_IDEA_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await updateIdea(makePatchRequest(VALID_IDEA_ID, { status: "RESEARCHING" }), {
      params: Promise.resolve({ id: VALID_IDEA_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when idea not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await updateIdea(makePatchRequest(VALID_IDEA_ID, { status: "RESEARCHING" }), {
      params: Promise.resolve({ id: VALID_IDEA_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when idea belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_IDEA, userId: OTHER_USER_ID });
    const res = await updateIdea(makePatchRequest(VALID_IDEA_ID, { status: "RESEARCHING" }), {
      params: Promise.resolve({ id: VALID_IDEA_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("updates idea status and returns 200", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_IDEA);
    const updated = { ...BASE_IDEA, status: "RESEARCHING" };
    mockUpdate.mockResolvedValueOnce(updated);
    const res = await updateIdea(makePatchRequest(VALID_IDEA_ID, { status: "RESEARCHING" }), {
      params: Promise.resolve({ id: VALID_IDEA_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof updated;
    expect(data.status).toBe("RESEARCHING");
  });
});

// ── DELETE /api/ideas/[id] ─────────────────────────────────────────────────────

describe("DELETE /api/ideas/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteIdea(makeDeleteRequest(VALID_IDEA_ID), {
      params: Promise.resolve({ id: VALID_IDEA_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteIdea(makeDeleteRequest(VALID_IDEA_ID), {
      params: Promise.resolve({ id: VALID_IDEA_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when idea belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_IDEA, userId: OTHER_USER_ID });
    const res = await deleteIdea(makeDeleteRequest(VALID_IDEA_ID), {
      params: Promise.resolve({ id: VALID_IDEA_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_IDEA);
    mockDelete.mockResolvedValueOnce(BASE_IDEA);
    const res = await deleteIdea(makeDeleteRequest(VALID_IDEA_ID), {
      params: Promise.resolve({ id: VALID_IDEA_ID }),
    });
    expect(res.status).toBe(204);
  });
});

// ── POST /api/ideas/[id]/to-post ───────────────────────────────────────────────

describe("POST /api/ideas/[id]/to-post", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = new NextRequest(`http://localhost:3000/api/ideas/${VALID_IDEA_ID}/to-post`, {
      method: "POST",
    });
    const res = await toPost(req, { params: Promise.resolve({ id: VALID_IDEA_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const req = new NextRequest(`http://localhost:3000/api/ideas/${VALID_IDEA_ID}/to-post`, {
      method: "POST",
    });
    const res = await toPost(req, { params: Promise.resolve({ id: VALID_IDEA_ID }) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when idea not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const req = new NextRequest(`http://localhost:3000/api/ideas/${VALID_IDEA_ID}/to-post`, {
      method: "POST",
    });
    const res = await toPost(req, { params: Promise.resolve({ id: VALID_IDEA_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when idea belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_IDEA, userId: OTHER_USER_ID });
    const req = new NextRequest(`http://localhost:3000/api/ideas/${VALID_IDEA_ID}/to-post`, {
      method: "POST",
    });
    const res = await toPost(req, { params: Promise.resolve({ id: VALID_IDEA_ID }) });
    expect(res.status).toBe(404);
  });

  it("creates draft post from idea and returns 201 with postId", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_IDEA);
    mockPostCreate.mockResolvedValueOnce({ id: "new-post-id" });
    const req = new NextRequest(`http://localhost:3000/api/ideas/${VALID_IDEA_ID}/to-post`, {
      method: "POST",
    });
    const res = await toPost(req, { params: Promise.resolve({ id: VALID_IDEA_ID }) });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { postId: string };
    expect(data.postId).toBe("new-post-id");

    const createCall = mockPostCreate.mock.calls[0][0] as { data: { content: string } };
    expect(createCall.data.content).toContain("Summer Campaign Post");
    expect(createCall.data.content).toContain("A series about summer products");
  });

  it("creates post using only title when description is null", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_IDEA, description: null });
    mockPostCreate.mockResolvedValueOnce({ id: "post-id-2" });
    const req = new NextRequest(`http://localhost:3000/api/ideas/${VALID_IDEA_ID}/to-post`, {
      method: "POST",
    });
    const res = await toPost(req, { params: Promise.resolve({ id: VALID_IDEA_ID }) });
    expect(res.status).toBe(201);

    const createCall = mockPostCreate.mock.calls[0][0] as { data: { content: string } };
    expect(createCall.data.content).toBe("Summer Campaign Post");
  });
});
