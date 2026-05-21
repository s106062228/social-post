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
    post: { findUnique: jest.fn() },
    tag: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/ai", () => ({
  suggestTagsForContent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/[id]/suggest-tags/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { suggestTagsForContent } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockTagFindMany = prisma.tag.findMany as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockSuggestTags = suggestTagsForContent as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(postId: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/posts/${postId}/suggest-tags`,
    { method: "POST" }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
});

describe("POST /api/posts/[id]/suggest-tags", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue({ success: false });
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI not configured", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(503);
  });

  it("returns 404 for invalid post ID", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await POST(makeRequest("not-a-cuid"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({
      id: MOCK_POST_ID,
      userId: OTHER_USER_ID,
      content: "Some content",
    });
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns suggestions from AI", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Hello world post about technology",
    });
    mockTagFindMany.mockResolvedValue([
      { id: "tag-1", name: "technology" },
      { id: "tag-2", name: "marketing" },
    ]);
    mockSuggestTags.mockResolvedValue([
      { tagId: "tag-1", name: "technology", reason: "Relevant to topic", isNew: false },
      { tagId: undefined, name: "innovation", reason: "New concept", isNew: true },
    ]);

    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      suggestions: { tagId?: string; name: string; reason: string; isNew: boolean }[];
    };
    expect(data.suggestions).toHaveLength(2);
    expect(data.suggestions[0].name).toBe("technology");
    expect(data.suggestions[1].isNew).toBe(true);
  });

  it("handles empty existing tags list", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "A post with no tags yet",
    });
    mockTagFindMany.mockResolvedValue([]);
    mockSuggestTags.mockResolvedValue([
      { tagId: undefined, name: "content", reason: "General topic", isNew: true },
    ]);

    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { suggestions: unknown[] };
    expect(data.suggestions).toHaveLength(1);
  });

  it("returns empty suggestions when AI returns none", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Short post",
    });
    mockTagFindMany.mockResolvedValue([]);
    mockSuggestTags.mockResolvedValue([]);

    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { suggestions: unknown[] };
    expect(data.suggestions).toHaveLength(0);
  });

  it("calls suggestTagsForContent with correct arguments", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const content = "Test content about travel";
    mockPostFindUnique.mockResolvedValue({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content,
    });
    const tags = [{ id: "t1", name: "travel" }];
    mockTagFindMany.mockResolvedValue(tags);
    mockSuggestTags.mockResolvedValue([]);

    await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });

    expect(mockSuggestTags).toHaveBeenCalledWith(content, tags);
  });
});
