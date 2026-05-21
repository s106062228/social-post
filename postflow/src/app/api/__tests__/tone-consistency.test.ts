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
    post: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/tone-consistency/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockFindMany = prisma.post.findMany as jest.Mock;
const mockCount = prisma.post.count as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

function makeRequest(params = ""): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/analytics/tone-consistency${params ? "?" + params : ""}`
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiLimiter.mockResolvedValue({ success: true });
});

describe("GET /api/analytics/tone-consistency", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await GET(makeRequest("period=invalid"));
    expect(res.status).toBe(400);
  });

  it("returns empty result when no analyzed posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(5);

    const res = await GET(makeRequest("period=30d"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      consistency: number;
      dominantTone: null;
      toneDistribution: unknown[];
      analyzedPosts: number;
      totalPosts: number;
    };
    expect(data.consistency).toBe(0);
    expect(data.dominantTone).toBeNull();
    expect(data.toneDistribution).toHaveLength(0);
    expect(data.analyzedPosts).toBe(0);
    expect(data.totalPosts).toBe(5);
  });

  it("returns correct distribution and consistency score", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    // 3 professional, 1 casual, 1 friendly → dominant = professional, 60% consistency
    mockFindMany.mockResolvedValueOnce([
      { tone: "professional" },
      { tone: "professional" },
      { tone: "professional" },
      { tone: "casual" },
      { tone: "friendly" },
    ]);
    mockCount.mockResolvedValueOnce(10);

    const res = await GET(makeRequest("period=30d"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      consistency: number;
      dominantTone: string;
      toneDistribution: Array<{ tone: string; count: number; percentage: number }>;
      analyzedPosts: number;
      totalPosts: number;
      period: string;
    };
    expect(data.dominantTone).toBe("professional");
    expect(data.consistency).toBe(60);
    expect(data.analyzedPosts).toBe(5);
    expect(data.totalPosts).toBe(10);
    expect(data.period).toBe("30d");

    const professionalEntry = data.toneDistribution.find((e) => e.tone === "professional");
    expect(professionalEntry?.count).toBe(3);
    expect(professionalEntry?.percentage).toBe(60);
  });

  it("returns 100% consistency when all posts have the same tone", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([
      { tone: "inspirational" },
      { tone: "inspirational" },
      { tone: "inspirational" },
    ]);
    mockCount.mockResolvedValueOnce(3);

    const res = await GET(makeRequest("period=7d"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { consistency: number; dominantTone: string };
    expect(data.consistency).toBe(100);
    expect(data.dominantTone).toBe("inspirational");
  });

  it("distribution is sorted by count descending", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockResolvedValueOnce([
      { tone: "casual" },
      { tone: "professional" },
      { tone: "professional" },
      { tone: "professional" },
      { tone: "casual" },
    ]);
    mockCount.mockResolvedValueOnce(5);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      toneDistribution: Array<{ tone: string; count: number }>;
    };
    expect(data.toneDistribution[0].tone).toBe("professional");
    expect(data.toneDistribution[0].count).toBe(3);
    expect(data.toneDistribution[1].tone).toBe("casual");
    expect(data.toneDistribution[1].count).toBe(2);
  });

  it("returns 500 on unexpected DB error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindMany.mockRejectedValueOnce(new Error("DB error"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
