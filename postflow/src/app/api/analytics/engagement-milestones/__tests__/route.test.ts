jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
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

jest.mock("@/lib/db", () => ({
  prisma: {
    postEngagementMilestone: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/engagement-milestones/route";
import { POST as POST_CELEBRATE } from "@/app/api/analytics/engagement-milestones/[id]/celebrate/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.postEngagementMilestone.findMany as jest.Mock;
const mockFindFirst = prisma.postEngagementMilestone.findFirst as jest.Mock;
const mockUpdate = prisma.postEngagementMilestone.update as jest.Mock;

const AUTHED = { user: { id: "user-1", email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

const SAMPLE_MILESTONE = {
  id: "ms-1",
  userId: "user-1",
  postId: "post-1",
  metric: "likes",
  threshold: 100,
  achievedAt: new Date("2026-06-01T10:00:00Z"),
  celebrated: false,
  createdAt: new Date("2026-06-01T10:00:00Z"),
  post: { id: "post-1", content: "Hello world! This is a test post." },
};

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/analytics/engagement-milestones");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

// ── GET /api/analytics/engagement-milestones ────────────────────────────────

describe("GET /api/analytics/engagement-milestones", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it("returns milestones array", async () => {
    mockFindMany.mockResolvedValue([SAMPLE_MILESTONE]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { milestones: typeof SAMPLE_MILESTONE[] };
    expect(Array.isArray(body.milestones)).toBe(true);
    expect(body.milestones).toHaveLength(1);
  });

  it("includes post info in each milestone", async () => {
    mockFindMany.mockResolvedValue([SAMPLE_MILESTONE]);
    const res = await GET(makeGetRequest());
    const body = (await res.json()) as { milestones: typeof SAMPLE_MILESTONE[] };
    expect(body.milestones[0].post).toEqual({ id: "post-1", content: expect.any(String) as string });
  });

  it("returns empty array when no milestones", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeGetRequest());
    const body = (await res.json()) as { milestones: unknown[] };
    expect(body.milestones).toHaveLength(0);
  });

  it("passes the period filter to the query", async () => {
    await GET(makeGetRequest({ period: "7d" }));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          achievedAt: expect.objectContaining({ gte: expect.any(Date) as Date }),
        }),
      })
    );
  });

  it("uses 30d by default", async () => {
    await GET(makeGetRequest());
    const call = mockFindMany.mock.calls[0][0] as {
      where: { achievedAt: { gte: Date } };
    };
    const from = call.where.achievedAt.gte;
    const diffDays = (Date.now() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(31);
  });
});

// ── POST /api/analytics/engagement-milestones/[id]/celebrate ────────────────

describe("POST /api/analytics/engagement-milestones/[id]/celebrate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockFindFirst.mockResolvedValue(SAMPLE_MILESTONE);
    mockUpdate.mockResolvedValue({ ...SAMPLE_MILESTONE, celebrated: true });
  });

  async function celebrate(id: string) {
    return POST_CELEBRATE(new Request("http://localhost"), {
      params: Promise.resolve({ id }),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await celebrate("ms-1");
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await celebrate("ms-1");
    expect(res.status).toBe(429);
  });

  it("returns 404 when milestone not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await celebrate("ms-999");
    expect(res.status).toBe(404);
  });

  it("returns 404 when milestone belongs to a different user", async () => {
    // findFirst returns null for ownership mismatch (where clause includes userId)
    mockFindFirst.mockResolvedValue(null);
    const res = await celebrate("ms-other");
    expect(res.status).toBe(404);
  });

  it("returns {celebrated: true} on success", async () => {
    const res = await celebrate("ms-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { celebrated: boolean };
    expect(body.celebrated).toBe(true);
  });

  it("calls prisma update with celebrated=true", async () => {
    await celebrate("ms-1");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "ms-1" },
      data: { celebrated: true },
    });
  });
});
