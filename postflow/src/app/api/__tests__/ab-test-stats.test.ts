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
    postABTest: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: Date.now() + 60000 }),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

import { NextRequest } from "next/server";
import { GET as getStats } from "@/app/api/ab-tests/[id]/stats/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.postABTest.findUnique as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

function makeRequest(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(`http://localhost/api/ab-tests/${id}/stats`);
  return [req, { params: Promise.resolve({ id }) }];
}

const emptyInsights = { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 };

const baseTest = {
  id: "test-1",
  userId: "user-1",
  name: "My A/B Test",
  winner: null,
  createdAt: new Date(),
  postA: {
    publishResults: [
      { insights: [{ ...emptyInsights }] },
    ],
  },
  postB: {
    publishResults: [
      { insights: [{ ...emptyInsights }] },
    ],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "user-1" } });
  mockApiLimiter.mockResolvedValue({ success: true });
});

describe("GET /api/ab-tests/[id]/stats", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const [req, ctx] = makeRequest("test-1");
    const res = await getStats(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false, limit: 100, remaining: 0, reset: Date.now() });
    const [req, ctx] = makeRequest("test-1");
    const res = await getStats(req, ctx);
    expect(res.status).toBe(429);
  });

  it("returns 404 when test not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const [req, ctx] = makeRequest("missing");
    const res = await getStats(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when test belongs to another user", async () => {
    mockFindUnique.mockResolvedValue({ ...baseTest, userId: "other-user" });
    const [req, ctx] = makeRequest("test-1");
    const res = await getStats(req, ctx);
    expect(res.status).toBe(403);
  });

  it("returns stats shape for a test with no insights", async () => {
    mockFindUnique.mockResolvedValue({ ...baseTest });
    const [req, ctx] = makeRequest("test-1");
    const res = await getStats(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.testId).toBe("test-1");
    expect(body.stats).toBeDefined();
    expect(typeof body.stats.zScore).toBe("number");
    expect(typeof body.stats.pValue).toBe("number");
    expect(body.stats.isSignificant).toBe(false);
    expect(body.stats.hasSufficientData).toBe(false);
  });

  it("aggregates multiple insight rows from publish results", async () => {
    const test = {
      ...baseTest,
      postA: {
        publishResults: [
          { insights: [{ impressions: 500, reach: 400, likes: 20, comments: 4, shares: 2 }] },
          { insights: [{ impressions: 300, reach: 250, likes: 10, comments: 2, shares: 1 }] },
        ],
      },
      postB: {
        publishResults: [
          { insights: [{ impressions: 400, reach: 350, likes: 5, comments: 1, shares: 0 }] },
        ],
      },
    };
    mockFindUnique.mockResolvedValue(test);
    const [req, ctx] = makeRequest("test-1");
    const res = await getStats(req, ctx);
    const body = await res.json();
    // A: 500+300=800 impressions, B: 400 impressions → hasSufficientData for A but not B needs 100 each
    expect(body.stats.impressionsA).toBe(800);
    expect(body.stats.impressionsB).toBe(400);
  });

  it("identifies significant winner for tests with large samples and big effect", async () => {
    const test = {
      ...baseTest,
      postA: {
        publishResults: [
          { insights: [{ impressions: 2000, reach: 1800, likes: 200, comments: 40, shares: 20 }] },
        ],
      },
      postB: {
        publishResults: [
          { insights: [{ impressions: 2000, reach: 1800, likes: 10, comments: 2, shares: 1 }] },
        ],
      },
    };
    mockFindUnique.mockResolvedValue(test);
    const [req, ctx] = makeRequest("test-1");
    const res = await getStats(req, ctx);
    const body = await res.json();
    expect(body.stats.isSignificant).toBe(true);
    expect(body.stats.winnerLead).toBe("A");
    expect(body.stats.hasSufficientData).toBe(true);
  });

  it("includes testId, name, winner, createdAt in response", async () => {
    mockFindUnique.mockResolvedValue({ ...baseTest });
    const [req, ctx] = makeRequest("test-1");
    const res = await getStats(req, ctx);
    const body = await res.json();
    expect(body.testId).toBe("test-1");
    expect(body.name).toBe("My A/B Test");
    expect("winner" in body).toBe(true);
    expect("createdAt" in body).toBe(true);
  });
});
