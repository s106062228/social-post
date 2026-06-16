jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  PublishStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PUBLISHED: "PUBLISHED",
    FAILED: "FAILED",
  },
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
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
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/evergreen-candidates/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/evergreen-candidates${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function makeDbPost(overrides: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    content: "A timeless productivity tip that helps everyone every day.",
    publishedAt: daysAgo(60),
    createdAt: daysAgo(60),
    isEvergreen: false,
    publishResults: [
      {
        insights: {
          likes: 100,
          comments: 20,
          shares: 30,
          reach: 2000,
          impressions: 3000,
        },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue({ success: true });
  mockFindMany.mockResolvedValue([]);
});

describe("GET /api/analytics/evergreen-candidates", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns empty candidates when no posts exist", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.candidates).toEqual([]);
    expect(json.totalAnalyzed).toBe(0);
    expect(json.avgScore).toBe(0);
  });

  it("returns candidates with required fields", async () => {
    mockFindMany.mockResolvedValue([makeDbPost()]);
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    const c = json.candidates[0];
    expect(c).toHaveProperty("postId");
    expect(c).toHaveProperty("content");
    expect(c).toHaveProperty("score");
    expect(c).toHaveProperty("label");
    expect(c).toHaveProperty("ageInDays");
    expect(c).toHaveProperty("engagementScore");
    expect(c).toHaveProperty("timelessnessScore");
    expect(c).toHaveProperty("hashtagScore");
    expect(c).toHaveProperty("likes");
    expect(c).toHaveProperty("comments");
    expect(c).toHaveProperty("shares");
    expect(c).toHaveProperty("isEvergreen");
  });

  it("filters out posts below minScore threshold", async () => {
    // Post with zero engagement should score low
    mockFindMany.mockResolvedValue([
      makeDbPost({
        publishResults: [
          { insights: { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 } },
        ],
      }),
    ]);
    const res = await GET(makeRequest({ minScore: "80" }));
    const json = await res.json();
    // A zero-engagement post should not reach score 80
    expect(json.candidates.length).toBe(0);
  });

  it("respects the limit query parameter", async () => {
    const posts = Array.from({ length: 10 }, (_, i) =>
      makeDbPost({ id: `post-${i}` })
    );
    mockFindMany.mockResolvedValue(posts);
    const res = await GET(makeRequest({ limit: "3", minScore: "0" }));
    const json = await res.json();
    expect(json.candidates.length).toBeLessThanOrEqual(3);
  });

  it("excludes posts with no insights", async () => {
    mockFindMany.mockResolvedValue([
      makeDbPost({ publishResults: [{ insights: null }] }),
      makeDbPost({ publishResults: [] }),
    ]);
    const res = await GET(makeRequest({ minScore: "0" }));
    const json = await res.json();
    expect(json.totalAnalyzed).toBe(0);
    expect(json.candidates).toEqual([]);
  });

  it("sorts candidates by score descending", async () => {
    mockFindMany.mockResolvedValue([
      makeDbPost({ id: "low", content: "today breaking news update", publishResults: [{ insights: { likes: 0, comments: 0, shares: 0, reach: 100, impressions: 200 } }] }),
      makeDbPost({ id: "high", content: "A timeless productivity tip every professional needs", publishResults: [{ insights: { likes: 200, comments: 50, shares: 80, reach: 5000, impressions: 8000 } }] }),
    ]);
    const res = await GET(makeRequest({ minScore: "0" }));
    const json = await res.json();
    if (json.candidates.length >= 2) {
      expect(json.candidates[0].score).toBeGreaterThanOrEqual(
        json.candidates[1].score
      );
    }
  });

  it("returns correct totalAnalyzed count", async () => {
    mockFindMany.mockResolvedValue([makeDbPost(), makeDbPost({ id: "post-2" })]);
    const res = await GET(makeRequest({ minScore: "0" }));
    const json = await res.json();
    expect(json.totalAnalyzed).toBe(2);
  });

  it("returns avgScore as rounded number", async () => {
    mockFindMany.mockResolvedValue([makeDbPost()]);
    const res = await GET(makeRequest({ minScore: "0" }));
    const json = await res.json();
    expect(Number.isInteger(json.avgScore)).toBe(true);
  });

  it("returns 500 on unexpected database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB failure"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
