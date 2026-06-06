jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    testimonial: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    post: {
      create: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listItems, POST as createItem } from "@/app/api/testimonials/route";
import { PATCH as updateItem, DELETE as deleteItem } from "@/app/api/testimonials/[id]/route";
import { POST as toPost } from "@/app/api/testimonials/[id]/to-post/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.testimonial.findMany as jest.Mock;
const mockFindUnique = prisma.testimonial.findUnique as jest.Mock;
const mockCreate = prisma.testimonial.create as jest.Mock;
const mockUpdate = prisma.testimonial.update as jest.Mock;
const mockDelete = prisma.testimonial.delete as jest.Mock;
const mockCount = prisma.testimonial.count as jest.Mock;
const mockPostCreate = prisma.post.create as jest.Mock;

const MOCK_USER_ID = "user_test_001";
const VALID_ID = "test_001";
const OTHER_USER_ID = "user_other_002";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_ITEM = {
  id: VALID_ID,
  userId: MOCK_USER_ID,
  authorName: "Jane Doe",
  authorTitle: "Marketing Director",
  company: "Acme Inc.",
  content: "PostFlow transformed how we schedule content!",
  rating: 5,
  sourceUrl: "https://example.com/review",
  imageUrl: "https://example.com/avatar.jpg",
  isFeatured: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/testimonials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeListRequest(qs = ""): NextRequest {
  return new NextRequest(`http://localhost:3000/api/testimonials${qs}`);
}

function makeIdRequest(id: string, method = "PATCH", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/testimonials/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── GET /api/testimonials ─────────────────────────────────────────────────────

describe("GET /api/testimonials", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listItems(makeListRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listItems(makeListRequest());
    expect(res.status).toBe(429);
  });

  it("returns list of items for the authenticated user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_ITEM]);

    const res = await listItems(makeListRequest());
    expect(res.status).toBe(200);
    const data = await res.json() as { items: typeof BASE_ITEM[] };
    expect(data.items).toHaveLength(1);
    expect(data.items[0].authorName).toBe("Jane Doe");
  });

  it("filters by featured=true", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([{ ...BASE_ITEM, isFeatured: true }]);

    const res = await listItems(makeListRequest("?featured=true"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: MOCK_USER_ID, isFeatured: true }),
      })
    );
  });

  it("returns empty list when user has no items", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await listItems(makeListRequest());
    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[] };
    expect(data.items).toHaveLength(0);
  });
});

// ── POST /api/testimonials ────────────────────────────────────────────────────

describe("POST /api/testimonials", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createItem(makeRequest({ authorName: "Jane", content: "Great!" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createItem(makeRequest({ authorName: "Jane", content: "Great!" }));
    expect(res.status).toBe(429);
  });

  it("returns 422 for invalid body (missing required fields)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createItem(makeRequest({ authorName: "" }));
    expect(res.status).toBe(422);
  });

  it("returns 422 for out-of-range rating", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createItem(makeRequest({ authorName: "Jane", content: "Great!", rating: 10 }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when max testimonials reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(200);
    const res = await createItem(makeRequest({ authorName: "Jane", content: "Great!" }));
    expect(res.status).toBe(422);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/maximum/i);
  });

  it("creates a testimonial successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_ITEM);

    const res = await createItem(
      makeRequest({ authorName: "Jane Doe", content: "PostFlow transformed how we schedule content!", rating: 5 })
    );
    expect(res.status).toBe(201);
    const data = await res.json() as { item: typeof BASE_ITEM };
    expect(data.item.authorName).toBe("Jane Doe");
  });
});

// ── PATCH /api/testimonials/[id] ──────────────────────────────────────────────

describe("PATCH /api/testimonials/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateItem(makeIdRequest(VALID_ID, "PATCH", { isFeatured: true }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await updateItem(makeIdRequest(VALID_ID, "PATCH", { isFeatured: true }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 422 for invalid body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await updateItem(makeIdRequest(VALID_ID, "PATCH", { rating: 99 }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 when item not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await updateItem(makeIdRequest(VALID_ID, "PATCH", { isFeatured: true }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when item belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_ITEM, userId: OTHER_USER_ID });
    const res = await updateItem(makeIdRequest(VALID_ID, "PATCH", { isFeatured: true }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("toggles isFeatured successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_ITEM);
    mockUpdate.mockResolvedValueOnce({ ...BASE_ITEM, isFeatured: true });

    const res = await updateItem(makeIdRequest(VALID_ID, "PATCH", { isFeatured: true }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { item: { isFeatured: boolean } };
    expect(data.item.isFeatured).toBe(true);
  });

  it("updates content successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_ITEM);
    mockUpdate.mockResolvedValueOnce({ ...BASE_ITEM, content: "Updated quote" });

    const res = await updateItem(makeIdRequest(VALID_ID, "PATCH", { content: "Updated quote" }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { item: { content: string } };
    expect(data.item.content).toBe("Updated quote");
  });
});

// ── DELETE /api/testimonials/[id] ─────────────────────────────────────────────

describe("DELETE /api/testimonials/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteItem(makeIdRequest(VALID_ID, "DELETE"), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteItem(makeIdRequest(VALID_ID, "DELETE"), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when item not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await deleteItem(makeIdRequest(VALID_ID, "DELETE"), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when item belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_ITEM, userId: OTHER_USER_ID });
    const res = await deleteItem(makeIdRequest(VALID_ID, "DELETE"), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("deletes item successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_ITEM);
    mockDelete.mockResolvedValueOnce(BASE_ITEM);

    const res = await deleteItem(makeIdRequest(VALID_ID, "DELETE"), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { success: boolean };
    expect(data.success).toBe(true);
  });
});

// ── POST /api/testimonials/[id]/to-post ───────────────────────────────────────

describe("POST /api/testimonials/[id]/to-post", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeToPostRequest(id: string): NextRequest {
    return new NextRequest(`http://localhost:3000/api/testimonials/${id}/to-post`, {
      method: "POST",
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await toPost(makeToPostRequest(VALID_ID), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await toPost(makeToPostRequest(VALID_ID), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when item not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await toPost(makeToPostRequest(VALID_ID), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when item belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_ITEM, userId: OTHER_USER_ID });
    const res = await toPost(makeToPostRequest(VALID_ID), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(404);
  });

  it("creates a draft post with image media when imageUrl is set", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_ITEM);
    mockPostCreate.mockResolvedValueOnce({ id: "post_001" });

    const res = await toPost(makeToPostRequest(VALID_ID), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { postId: string };
    expect(data.postId).toBe("post_001");
    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_USER_ID,
          mediaType: "IMAGE",
          mediaUrls: [BASE_ITEM.imageUrl],
          status: "DRAFT",
          content: expect.stringContaining(BASE_ITEM.content),
        }),
      })
    );
  });

  it("creates a draft post with no media when imageUrl is null", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_ITEM, imageUrl: null, rating: null });
    mockPostCreate.mockResolvedValueOnce({ id: "post_002" });

    const res = await toPost(makeToPostRequest(VALID_ID), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(201);
    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mediaType: "NONE",
          mediaUrls: [],
        }),
      })
    );
  });
});
