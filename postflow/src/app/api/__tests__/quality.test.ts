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
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findUnique: jest.fn(),
    },
    brandKit: {
      findUnique: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/posts/[id]/quality/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockBrandKitFindUnique = prisma.brandKit.findUnique as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

function makeRequest(postId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/quality`, {
    method: "GET",
  });
}

describe("GET /api/posts/[id]/quality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
    mockBrandKitFindUnique.mockResolvedValue(null);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid post ID format", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await GET(makeRequest("not-a-cuid"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to different user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: OTHER_USER_ID,
      content: "Some post content",
      sentiment: null,
    });
    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns quality score shape without brand kit", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "This is a great post about social media. Check it out! #social #media",
      sentiment: null,
    });
    mockBrandKitFindUnique.mockResolvedValueOnce(null);

    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      qualityScore: number;
      label: string;
      breakdown: {
        readability: number;
        seo: number;
        sentiment: number | null;
        compliance: number | null;
      };
    };
    expect(typeof data.qualityScore).toBe("number");
    expect(data.qualityScore).toBeGreaterThanOrEqual(0);
    expect(data.qualityScore).toBeLessThanOrEqual(100);
    expect(["Excellent", "Good", "Fair", "Needs Work"]).toContain(data.label);
    expect(typeof data.breakdown.readability).toBe("number");
    expect(typeof data.breakdown.seo).toBe("number");
    expect(data.breakdown.sentiment).toBeNull();
    expect(data.breakdown.compliance).toBeNull();
  });

  it("includes sentiment score when post has sentiment", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Great news today! #happy",
      sentiment: "POSITIVE",
    });

    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { breakdown: { sentiment: number | null } };
    expect(data.breakdown.sentiment).toBe(100);
  });

  it("includes compliance score when brand kit exists", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Our brand voice shines through every post we write today.",
      sentiment: null,
    });
    mockBrandKitFindUnique.mockResolvedValueOnce({
      doKeywords: ["brand voice"],
      dontKeywords: [],
    });

    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { breakdown: { compliance: number | null } };
    expect(data.breakdown.compliance).not.toBeNull();
    expect(typeof data.breakdown.compliance).toBe("number");
  });

  it("returns all signals present when post has sentiment and brand kit", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({
      id: MOCK_POST_ID,
      userId: MOCK_USER_ID,
      content: "Amazing content for our brand voice today! #awesome",
      sentiment: "POSITIVE",
    });
    mockBrandKitFindUnique.mockResolvedValueOnce({
      doKeywords: ["brand voice"],
      dontKeywords: [],
    });

    const res = await GET(makeRequest(MOCK_POST_ID), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      qualityScore: number;
      label: string;
      breakdown: { readability: number; seo: number; sentiment: number | null; compliance: number | null };
    };
    expect(data.breakdown.sentiment).toBe(100);
    expect(data.breakdown.compliance).not.toBeNull();
    expect(data.qualityScore).toBeGreaterThan(0);
  });
});
