jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: {
    FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS",
    LINKEDIN: "LINKEDIN", TWITTER: "TWITTER",
  },
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
  },
}));

jest.mock("@/lib/ai", () => ({
  suggestContentRefresh: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/[id]/suggest-refresh/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { suggestContentRefresh } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.post.findUnique as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockSuggestRefresh = suggestContentRefresh as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(postId: string, body?: object): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/suggest-refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

const MOCK_POST = {
  id: MOCK_POST_ID,
  userId: MOCK_USER_ID,
  content: "Check out our amazing product launch! #launch #product",
  createdAt: new Date("2024-01-15T10:00:00Z"),
  publishResults: [{ platform: "FACEBOOK" }, { platform: "INSTAGRAM" }],
};

const MOCK_RESULT = {
  suggestions: [
    {
      type: "hashtag_update",
      updated: "#trending #viral #launch",
      reason: "Updated hashtags for better discoverability",
    },
    {
      type: "add_cta",
      original: "Check out our amazing product launch!",
      updated: "Check out our amazing product launch! Link in bio 👆",
      reason: "Added a call-to-action for Instagram",
    },
  ],
  refreshedContent: "Check out our amazing product launch! Link in bio 👆 #trending #viral #launch",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});

afterAll(() => {
  process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
});

describe("POST /api/posts/[id]/suggest-refresh", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 404 for invalid post ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest("not-a-cuid"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Post not found");
  });

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({ ...MOCK_POST, userId: OTHER_USER_ID });
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns refresh suggestions using published platforms by default", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(MOCK_POST);
    mockSuggestRefresh.mockResolvedValueOnce(MOCK_RESULT);

    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof MOCK_RESULT;
    expect(data.suggestions).toHaveLength(2);
    expect(data.refreshedContent).toBe(MOCK_RESULT.refreshedContent);
    expect(mockSuggestRefresh).toHaveBeenCalledWith(
      MOCK_POST.content,
      "2024-01-15",
      ["FACEBOOK", "INSTAGRAM"]
    );
  });

  it("uses specified targetPlatforms when provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(MOCK_POST);
    mockSuggestRefresh.mockResolvedValueOnce(MOCK_RESULT);

    const res = await POST(makeRequest(MOCK_POST_ID, { targetPlatforms: ["TWITTER"] }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    expect(mockSuggestRefresh).toHaveBeenCalledWith(
      MOCK_POST.content,
      "2024-01-15",
      ["TWITTER"]
    );
  });

  it("returns 400 for invalid targetPlatforms value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest(MOCK_POST_ID, { targetPlatforms: ["INVALID_PLATFORM"] }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/validation/i);
  });

  it("returns 200 with response shape including suggestions and refreshedContent", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(MOCK_POST);
    mockSuggestRefresh.mockResolvedValueOnce(MOCK_RESULT);

    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { suggestions: unknown[]; refreshedContent: string };
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(typeof data.refreshedContent).toBe("string");
    expect(data.suggestions[0]).toMatchObject({
      type: expect.any(String),
      updated: expect.any(String),
      reason: expect.any(String),
    });
  });

  it("returns 500 on unexpected error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockRejectedValueOnce(new Error("DB connection failed"));
    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(500);
  });

  it("falls back to all platforms when post has no publish results", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      ...MOCK_POST,
      publishResults: [],
    });
    mockSuggestRefresh.mockResolvedValueOnce(MOCK_RESULT);

    const res = await POST(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    // Should use all platform values when no publish results
    const calledPlatforms = mockSuggestRefresh.mock.calls[0][2] as string[];
    expect(calledPlatforms.length).toBeGreaterThan(0);
  });
});
