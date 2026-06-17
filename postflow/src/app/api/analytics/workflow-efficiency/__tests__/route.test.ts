import { GET } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  httpLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
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
      constructor(message: string, opts: { code: string; clientVersion: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({ prisma: { post: { findMany: jest.fn() } } }));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockFindMany = prisma.post.findMany as jest.MockedFunction<typeof prisma.post.findMany>;
const mockApiLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;

const AUTHED = { user: { id: "user-1", email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/analytics/workflow-efficiency");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED as Awaited<ReturnType<typeof auth>>);
  mockApiLimiter.mockResolvedValue(RL_OK as Awaited<ReturnType<typeof apiLimiter>>);
  mockFindMany.mockResolvedValue([]);
});

describe("GET /api/analytics/workflow-efficiency", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL as Awaited<ReturnType<typeof apiLimiter>>);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    const res = await GET(makeRequest({ period: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns empty state with correct shape when no posts", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.postsPublished).toBe(0);
    expect(body.postsStillDraft).toBe(0);
    expect(body.avgDraftToScheduledHours).toBeNull();
    expect(body.avgScheduledToPublishedHours).toBeNull();
    expect(body.avgDraftToPublishedHours).toBeNull();
    expect(body.fastestPublishHours).toBeNull();
    expect(body.slowestPublishHours).toBeNull();
    expect(Array.isArray(body.statusDistribution)).toBe(true);
  });

  it("echoes the period in the response", async () => {
    const res = await GET(makeRequest({ period: "90d" }));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.period).toBe("90d");
  });

  it("defaults to 30d when no period is specified", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.period).toBe("30d");
  });

  it("computes avgDraftToScheduledHours from post data", async () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2h ago
    const scheduledAt = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1h ago (1h after creation)
    mockFindMany.mockResolvedValue([
      {
        status: "SCHEDULED",
        createdAt,
        scheduledAt,
        publishResults: [],
      },
    ] as Awaited<ReturnType<typeof prisma.post.findMany>>);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.avgDraftToScheduledHours).toBe("number");
    expect(body.avgDraftToScheduledHours).toBeCloseTo(1, 0);
  });

  it("returns correct response shape with published posts", async () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const scheduledAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const publishedAt = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    mockFindMany.mockResolvedValue([
      {
        status: "PUBLISHED",
        createdAt,
        scheduledAt,
        publishResults: [{ publishedAt, status: "PUBLISHED" }],
      },
    ] as Awaited<ReturnType<typeof prisma.post.findMany>>);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.postsPublished).toBe(1);
    expect(typeof body.avgDraftToPublishedHours).toBe("number");
    expect(typeof body.fastestPublishHours).toBe("number");
    expect(typeof body.slowestPublishHours).toBe("number");
  });

  it("counts postsStillDraft correctly", async () => {
    mockFindMany.mockResolvedValue([
      { status: "DRAFT", createdAt: new Date(), scheduledAt: null, publishResults: [] },
      { status: "DRAFT", createdAt: new Date(), scheduledAt: null, publishResults: [] },
      { status: "PUBLISHED", createdAt: new Date(), scheduledAt: null, publishResults: [{ publishedAt: new Date(), status: "PUBLISHED" }] },
    ] as Awaited<ReturnType<typeof prisma.post.findMany>>);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.postsStillDraft).toBe(2);
    expect(body.postsPublished).toBe(1);
  });

  it("returns 500 on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
