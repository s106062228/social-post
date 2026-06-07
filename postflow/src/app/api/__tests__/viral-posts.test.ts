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
import { GET } from "@/app/api/analytics/viral-posts/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import {
  computeEngagementVelocity,
  classifyViralStatus,
  detectViralPosts,
  type PostForViral,
} from "@/lib/viral-detection";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/viral-posts${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue({ success: true });
  mockFindMany.mockResolvedValue([]);
});

// ── Utility tests ─────────────────────────────────────────────────────────────

describe("computeEngagementVelocity", () => {
  it("returns engagement per hour", () => {
    const publishedAt = hoursAgo(10);
    const velocity = computeEngagementVelocity(100, publishedAt);
    expect(velocity).toBeCloseTo(10, 0);
  });

  it("returns 0 for zero engagement", () => {
    const velocity = computeEngagementVelocity(0, hoursAgo(5));
    expect(velocity).toBe(0);
  });

  it("returns 0 if publishedAt is in the future", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const velocity = computeEngagementVelocity(100, future);
    expect(velocity).toBe(0);
  });
});

describe("classifyViralStatus", () => {
  it("returns viral when velocity >= 3x average", () => {
    expect(classifyViralStatus(300, 100)).toBe("viral");
  });

  it("returns trending when velocity >= 1.5x average", () => {
    expect(classifyViralStatus(200, 100)).toBe("trending");
  });

  it("returns normal when below 1.5x average", () => {
    expect(classifyViralStatus(100, 100)).toBe("normal");
  });

  it("returns trending when avgVelocity is 0 but velocity > 0", () => {
    expect(classifyViralStatus(5, 0)).toBe("trending");
  });

  it("returns normal when both are 0", () => {
    expect(classifyViralStatus(0, 0)).toBe("normal");
  });
});

describe("detectViralPosts", () => {
  it("returns empty array for empty input", () => {
    expect(detectViralPosts([])).toHaveLength(0);
  });

  it("sorts by velocity descending", () => {
    const posts: PostForViral[] = [
      {
        postId: "a",
        content: "slow",
        publishedAt: hoursAgo(48),
        platform: "FACEBOOK",
        insights: { likes: 10, comments: 0, shares: 0, reach: 0, impressions: 0 },
      },
      {
        postId: "b",
        content: "fast",
        publishedAt: hoursAgo(1),
        platform: "INSTAGRAM",
        insights: { likes: 100, comments: 10, shares: 5, reach: 0, impressions: 0 },
      },
    ];
    const result = detectViralPosts(posts);
    expect(result[0].postId).toBe("b");
    expect(result[1].postId).toBe("a");
  });

  it("labels the highest-velocity post as viral when it is 3x the average", () => {
    const now = new Date();
    // 9 slow posts at ~3pts/h and 1 fast post at ~17100pts/h
    // avg = (9*3 + 17100) / 10 = 17127 / 10 ≈ 1712.7
    // fast velocity 17100 >= 3 * 1712.7 ≈ 5138 → viral
    const slowPost = (id: string): PostForViral => ({
      postId: id,
      content: "slow",
      publishedAt: hoursAgo(10),
      platform: "FACEBOOK",
      insights: { likes: 10, comments: 0, shares: 0, reach: 0, impressions: 0 },
    });
    const posts: PostForViral[] = [
      slowPost("s1"),
      slowPost("s2"),
      slowPost("s3"),
      slowPost("s4"),
      slowPost("s5"),
      slowPost("s6"),
      slowPost("s7"),
      slowPost("s8"),
      slowPost("s9"),
      {
        postId: "viral",
        content: "viral",
        publishedAt: hoursAgo(1),
        platform: "INSTAGRAM",
        insights: {
          likes: 1000,
          comments: 500,
          shares: 400,
          reach: 5000,
          impressions: 10000,
        },
      },
    ];
    const result = detectViralPosts(posts, now);
    expect(result[0].postId).toBe("viral");
    expect(result[0].viralStatus).toBe("viral");
  });

  it("includes correct metric breakdown", () => {
    const posts: PostForViral[] = [
      {
        postId: "p1",
        content: "test",
        publishedAt: hoursAgo(2),
        platform: "THREADS",
        insights: {
          likes: 5,
          comments: 3,
          shares: 2,
          reach: 100,
          impressions: 200,
        },
      },
    ];
    const result = detectViralPosts(posts);
    expect(result[0].metrics.likes).toBe(5);
    expect(result[0].metrics.comments).toBe(3);
    expect(result[0].metrics.shares).toBe(2);
    expect(result[0].metrics.reach).toBe(100);
    expect(result[0].metrics.impressions).toBe(200);
  });
});

// ── API endpoint tests ─────────────────────────────────────────────────────────

describe("GET /api/analytics/viral-posts", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    const res = await GET(makeRequest({ period: "99d" }));
    expect(res.status).toBe(400);
  });

  it("returns empty posts array when no data", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(0);
    expect(body.avgVelocity).toBe(0);
    expect(body.totalPosts).toBe(0);
  });

  it("returns posts with correct shape", async () => {
    const publishedAt = hoursAgo(2);
    mockFindMany.mockResolvedValueOnce([
      {
        id: "post-1",
        content: "Hello world",
        publishResults: [
          {
            platform: "FACEBOOK",
            publishedAt,
            insights: {
              likes: 10,
              comments: 5,
              shares: 2,
              reach: 200,
              impressions: 500,
            },
          },
        ],
      },
    ]);
    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
    const post = body.posts[0];
    expect(post.postId).toBe("post-1");
    expect(post.platform).toBe("FACEBOOK");
    expect(post.content).toBe("Hello world");
    expect(typeof post.velocityPerHour).toBe("number");
    expect(["viral", "trending", "normal"]).toContain(post.viralStatus);
    expect(body.period).toBe("7d");
  });

  it("respects 24h period filter", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeRequest({ period: "24h" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe("24h");
  });

  it("skips publish results with no insights", async () => {
    const publishedAt = hoursAgo(3);
    mockFindMany.mockResolvedValueOnce([
      {
        id: "post-2",
        content: "No insights",
        publishResults: [
          {
            platform: "INSTAGRAM",
            publishedAt,
            insights: null,
          },
        ],
      },
    ]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(0);
    expect(body.totalPosts).toBe(0);
  });

  it("returns DB error as 500", async () => {
    mockFindMany.mockRejectedValueOnce(new Error("DB failure"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
