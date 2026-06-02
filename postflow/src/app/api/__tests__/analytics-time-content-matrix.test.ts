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
  PublishStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PUBLISHED: "PUBLISHED",
    FAILED: "FAILED",
  },
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
    TWITTER: "TWITTER",
    LINKEDIN: "LINKEDIN",
    TIKTOK: "TIKTOK",
    YOUTUBE: "YOUTUBE",
    REDDIT: "REDDIT",
    PINTEREST: "PINTEREST",
    BLUESKY: "BLUESKY",
    MASTODON: "MASTODON",
    TELEGRAM: "TELEGRAM",
    NOSTR: "NOSTR",
    TUMBLR: "TUMBLR",
    WORDPRESS: "WORDPRESS",
    MEDIUM: "MEDIUM",
    GHOST: "GHOST",
    DEVTO: "DEVTO",
    HASHNODE: "HASHNODE",
    VIMEO: "VIMEO",
    PIXELFED: "PIXELFED",
    BEEHIIV: "BEEHIIV",
    GOOGLE_BUSINESS: "GOOGLE_BUSINESS",
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
import { GET, formatHourLabel } from "@/app/api/analytics/time-content-matrix/route";
import type { TimeContentMatrixResponse } from "@/app/api/analytics/time-content-matrix/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/time-content-matrix${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

/** Build a mock post with one publish result at a specific UTC hour */
function makePost(
  category: string | null,
  utcHour: number,
  likes: number,
  comments: number,
  shares: number
) {
  // Build a Date with a fixed UTC hour
  const publishedAt = new Date(Date.UTC(2025, 0, 15, utcHour, 0, 0));
  return {
    contentCategory: category,
    publishResults: [
      {
        publishedAt,
        insights: { likes, comments, shares },
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
  mockPostFindMany.mockResolvedValue([]);
});

// ── Auth ─────────────────────────────────────────────────────────────────────

describe("GET /api/analytics/time-content-matrix", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  // ── Period validation ───────────────────────────────────────────────────────

  it("returns 400 for invalid period", async () => {
    const res = await GET(makeRequest({ period: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("accepts all valid period values", async () => {
    for (const p of ["7d", "30d", "90d", "all"]) {
      const res = await GET(makeRequest({ period: p }));
      expect(res.status).toBe(200);
    }
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it("returns empty state when no posts", async () => {
    mockPostFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as TimeContentMatrixResponse;
    expect(body.matrix).toHaveLength(0);
    expect(body.categories).toHaveLength(0);
    expect(body.totalDataPoints).toBe(0);
    expect(body.recommendations).toHaveLength(0);
  });

  // ── Response shape ──────────────────────────────────────────────────────────

  it("returns correct response shape", async () => {
    const res = await GET(makeRequest({ period: "30d" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as TimeContentMatrixResponse;
    expect(body).toHaveProperty("period", "30d");
    expect(Array.isArray(body.matrix)).toBe(true);
    expect(Array.isArray(body.categories)).toBe(true);
    expect(typeof body.totalDataPoints).toBe("number");
    expect(Array.isArray(body.recommendations)).toBe(true);
  });

  // ── Hour bucketing ──────────────────────────────────────────────────────────

  it("extracts UTC hour from publishedAt and groups correctly", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost("EDUCATIONAL", 9, 10, 2, 1),  // 9am UTC
      makePost("EDUCATIONAL", 9, 20, 4, 2),  // 9am UTC same bucket
    ]);

    const res = await GET(makeRequest({ period: "30d" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as TimeContentMatrixResponse;

    expect(body.matrix).toHaveLength(1);
    const cell = body.matrix[0];
    expect(cell.hour).toBe(9);
    expect(cell.category).toBe("EDUCATIONAL");
    expect(cell.postCount).toBe(2);
    // avg engagement: (13 + 26) / 2 = 19.5
    expect(cell.avgEngagement).toBe(19.5);
  });

  it("separates posts at different hours into distinct cells", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost("PROMOTIONAL", 8, 5, 1, 0),
      makePost("PROMOTIONAL", 18, 15, 3, 2),
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as TimeContentMatrixResponse;

    expect(body.matrix).toHaveLength(2);
    const hours = body.matrix.map((c) => c.hour).sort((a, b) => a - b);
    expect(hours).toEqual([8, 18]);
  });

  // ── Null category ───────────────────────────────────────────────────────────

  it("treats null contentCategory as UNCATEGORIZED", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost(null, 12, 5, 1, 0),
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as TimeContentMatrixResponse;

    expect(body.categories).toContain("UNCATEGORIZED");
    const cell = body.matrix.find((c) => c.category === "UNCATEGORIZED");
    expect(cell).toBeDefined();
    expect(cell?.hour).toBe(12);
  });

  // ── Recommendations ─────────────────────────────────────────────────────────

  it("builds recommendations with best hour per category sorted by engagement", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost("EDUCATIONAL", 9, 10, 2, 1),
      makePost("EDUCATIONAL", 15, 30, 5, 5), // higher engagement → optimal
      makePost("PROMOTIONAL", 20, 50, 10, 8), // only one hour for PROMOTIONAL
    ]);

    const res = await GET(makeRequest());
    const body = (await res.json()) as TimeContentMatrixResponse;

    expect(body.recommendations.length).toBeGreaterThanOrEqual(2);

    const promoRec = body.recommendations.find((r) => r.category === "PROMOTIONAL");
    expect(promoRec).toBeDefined();
    expect(promoRec?.optimalHour).toBe(20);

    const eduRec = body.recommendations.find((r) => r.category === "EDUCATIONAL");
    expect(eduRec).toBeDefined();
    expect(eduRec?.optimalHour).toBe(15);

    // PROMOTIONAL has highest engagement so should sort first
    expect(body.recommendations[0].category).toBe("PROMOTIONAL");
  });

  // ── formatHourLabel ─────────────────────────────────────────────────────────

  it("formats hour labels correctly", () => {
    expect(formatHourLabel(0)).toBe("12am");
    expect(formatHourLabel(1)).toBe("1am");
    expect(formatHourLabel(11)).toBe("11am");
    expect(formatHourLabel(12)).toBe("12pm");
    expect(formatHourLabel(13)).toBe("1pm");
    expect(formatHourLabel(23)).toBe("11pm");
  });
});
