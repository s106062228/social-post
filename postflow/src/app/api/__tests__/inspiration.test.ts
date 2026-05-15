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
    inspirationItem: {
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

jest.mock("@/lib/og-preview", () => ({
  fetchOgMetadata: jest.fn(),
}));

jest.mock("@/lib/ai", () => ({
  generateInspiredContent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET as listItems, POST as createItem } from "@/app/api/inspiration/route";
import { PATCH as updateItem, DELETE as deleteItem } from "@/app/api/inspiration/[id]/route";
import { POST as toPost } from "@/app/api/inspiration/[id]/to-post/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { fetchOgMetadata } from "@/lib/og-preview";
import { generateInspiredContent } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.inspirationItem.findMany as jest.Mock;
const mockFindUnique = prisma.inspirationItem.findUnique as jest.Mock;
const mockCreate = prisma.inspirationItem.create as jest.Mock;
const mockUpdate = prisma.inspirationItem.update as jest.Mock;
const mockDelete = prisma.inspirationItem.delete as jest.Mock;
const mockCount = prisma.inspirationItem.count as jest.Mock;
const mockPostCreate = prisma.post.create as jest.Mock;
const mockFetchOg = fetchOgMetadata as jest.Mock;
const mockGenerateInspired = generateInspiredContent as jest.Mock;

const MOCK_USER_ID = "user_test_001";
const VALID_ID = "insp_001";
const OTHER_USER_ID = "user_other_002";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_ITEM = {
  id: VALID_ID,
  userId: MOCK_USER_ID,
  url: "https://example.com/article",
  title: "Great Article",
  description: "This is a description",
  imageUrl: "https://example.com/img.jpg",
  notes: "Some notes",
  platform: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/inspiration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeIdRequest(id: string, method = "PATCH", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/inspiration/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── GET /api/inspiration ──────────────────────────────────────────────────────

describe("GET /api/inspiration", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listItems();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listItems();
    expect(res.status).toBe(429);
  });

  it("returns list of items for the authenticated user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_ITEM]);

    const res = await listItems();
    expect(res.status).toBe(200);
    const data = await res.json() as { items: typeof BASE_ITEM[] };
    expect(data.items).toHaveLength(1);
    expect(data.items[0].title).toBe("Great Article");
  });

  it("returns empty list when user has no items", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await listItems();
    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[] };
    expect(data.items).toHaveLength(0);
  });
});

// ── POST /api/inspiration ─────────────────────────────────────────────────────

describe("POST /api/inspiration", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createItem(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createItem(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(429);
  });

  it("returns 422 for invalid URL", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createItem(makeRequest({ url: "not-a-url" }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when max items reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(200);
    const res = await createItem(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(422);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/maximum/i);
  });

  it("creates item with OG metadata", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockFetchOg.mockResolvedValueOnce({
      url: "https://example.com",
      title: "Fetched Title",
      description: "Fetched Desc",
      image: "https://example.com/img.jpg",
    });
    mockCreate.mockResolvedValueOnce(BASE_ITEM);

    const res = await createItem(makeRequest({ url: "https://example.com", notes: "My notes" }));
    expect(res.status).toBe(201);
    const data = await res.json() as { item: typeof BASE_ITEM };
    expect(data.item.title).toBe("Great Article");
    expect(mockFetchOg).toHaveBeenCalledWith("https://example.com");
  });

  it("creates item even when OG metadata fetch fails", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockFetchOg.mockRejectedValueOnce(new Error("network error"));
    mockCreate.mockResolvedValueOnce({ ...BASE_ITEM, title: null, description: null, imageUrl: null });

    const res = await createItem(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(201);
  });
});

// ── PATCH /api/inspiration/[id] ───────────────────────────────────────────────

describe("PATCH /api/inspiration/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateItem(makeIdRequest(VALID_ID, "PATCH", { notes: "new notes" }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when item not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await updateItem(makeIdRequest(VALID_ID, "PATCH", { notes: "new notes" }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when item belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_ITEM, userId: OTHER_USER_ID });
    const res = await updateItem(makeIdRequest(VALID_ID, "PATCH", { notes: "new notes" }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("updates notes successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_ITEM);
    mockUpdate.mockResolvedValueOnce({ ...BASE_ITEM, notes: "updated notes" });

    const res = await updateItem(makeIdRequest(VALID_ID, "PATCH", { notes: "updated notes" }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { item: { notes: string } };
    expect(data.item.notes).toBe("updated notes");
  });
});

// ── DELETE /api/inspiration/[id] ──────────────────────────────────────────────

describe("DELETE /api/inspiration/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteItem(makeIdRequest(VALID_ID, "DELETE"), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(401);
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

// ── POST /api/inspiration/[id]/to-post ───────────────────────────────────────

describe("POST /api/inspiration/[id]/to-post", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await toPost(
      new NextRequest(`http://localhost:3000/api/inspiration/${VALID_ID}/to-post`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }),
      { params: Promise.resolve({ id: VALID_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when item not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await toPost(
      new NextRequest(`http://localhost:3000/api/inspiration/${VALID_ID}/to-post`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }),
      { params: Promise.resolve({ id: VALID_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("creates draft post without AI", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_ITEM);
    mockPostCreate.mockResolvedValueOnce({ id: "post_001" });

    const res = await toPost(
      new NextRequest(`http://localhost:3000/api/inspiration/${VALID_ID}/to-post`, { method: "POST", body: JSON.stringify({ useAi: false }), headers: { "Content-Type": "application/json" } }),
      { params: Promise.resolve({ id: VALID_ID }) }
    );
    expect(res.status).toBe(201);
    const data = await res.json() as { postId: string };
    expect(data.postId).toBe("post_001");
    expect(mockGenerateInspired).not.toHaveBeenCalled();
  });

  it("creates draft post with AI when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_ITEM);
    mockGenerateInspired.mockResolvedValueOnce("AI-generated content");
    mockPostCreate.mockResolvedValueOnce({ id: "post_002" });

    const res = await toPost(
      new NextRequest(`http://localhost:3000/api/inspiration/${VALID_ID}/to-post`, { method: "POST", body: JSON.stringify({ useAi: true }), headers: { "Content-Type": "application/json" } }),
      { params: Promise.resolve({ id: VALID_ID }) }
    );
    expect(res.status).toBe(201);
    expect(mockGenerateInspired).toHaveBeenCalledWith(
      BASE_ITEM.title,
      BASE_ITEM.description,
      BASE_ITEM.notes,
      []
    );
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("falls back to plain content when AI fails", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_ITEM);
    mockGenerateInspired.mockRejectedValueOnce(new Error("AI error"));
    mockPostCreate.mockResolvedValueOnce({ id: "post_003" });

    const res = await toPost(
      new NextRequest(`http://localhost:3000/api/inspiration/${VALID_ID}/to-post`, { method: "POST", body: JSON.stringify({ useAi: true }), headers: { "Content-Type": "application/json" } }),
      { params: Promise.resolve({ id: VALID_ID }) }
    );
    expect(res.status).toBe(201);
    // Should still succeed (fallback to plain content)
    const data = await res.json() as { postId: string };
    expect(data.postId).toBe("post_003");
    delete process.env.ANTHROPIC_API_KEY;
  });
});
