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
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    socialAccount: { findMany: jest.fn() },
    publishResult: { findMany: jest.fn() },
    post: { findMany: jest.fn() },
    auditReport: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/consistency", () => ({
  computeConsistency: jest.fn().mockReturnValue({
    score: 70,
    streak: 3,
    avgPostsPerWeek: 2.5,
    gaps: [],
    periodDays: 30,
    totalPosts: 10,
  }),
}));

jest.mock("@/lib/posting-frequency", () => ({
  computePlatformFrequency: jest.fn().mockReturnValue([
    { platform: "FACEBOOK", actualPerWeek: 2, recommendedPerWeek: 5, pacingScore: 65, status: "under", totalPublished: 8 },
  ]),
}));

jest.mock("@/lib/engagement-benchmarks", () => ({
  computeBenchmarkComparisons: jest.fn().mockReturnValue([
    {
      platform: "FACEBOOK",
      userMetrics: { impressions: 0, reach: 100, likes: 5, comments: 2, shares: 1, postCount: 8, avgEngagementRate: 8 },
      benchmark: { engagementRate: 0.64, source: "test" },
      performance: "above",
      diffPct: 5,
    },
  ]),
}));

jest.mock("@/lib/content-score", () => ({
  computeScore: jest.fn().mockReturnValue(50),
}));

import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/analytics/audit/route";
import { GET as getDetail } from "@/app/api/analytics/audit/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockSocialAccountFindMany = prisma.socialAccount.findMany as jest.Mock;
const mockPublishResultFindMany = prisma.publishResult.findMany as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockAuditReportCreate = prisma.auditReport.create as jest.Mock;
const mockAuditReportFindMany = prisma.auditReport.findMany as jest.Mock;
const mockAuditReportFindUnique = prisma.auditReport.findUnique as jest.Mock;

const MOCK_USER_ID = "user123";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 10, remaining: 9, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 10, remaining: 0, resetAt: new Date() };

const MOCK_REPORT = {
  id: "report1",
  userId: MOCK_USER_ID,
  period: "30d",
  generatedAt: new Date("2026-08-20T12:00:00Z"),
  overallScore: 72,
  accountHealth: [],
  contentMix: { total: 0, categories: [] },
  postingPatterns: { platforms: [], overallPacingScore: 65 },
  engagementBenchmarks: [],
  consistencyScore: { score: 70, streak: 3, avgPostsPerWeek: 2.5, gaps: [], periodDays: 30, totalPosts: 10 },
  topContent: [],
  recommendations: ["Keep it up!"],
};

function makePostRequest() {
  return new NextRequest("http://localhost:3000/api/analytics/audit", {
    method: "POST",
  });
}

function makeGetRequest() {
  return new NextRequest("http://localhost:3000/api/analytics/audit", {
    method: "GET",
  });
}

function makeDetailRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/analytics/audit/${id}`, {
    method: "GET",
  });
}

describe("POST /api/analytics/audit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocialAccountFindMany.mockResolvedValue([]);
    mockPublishResultFindMany.mockResolvedValue([]);
    mockPostFindMany.mockResolvedValue([]);
    mockAuditReportCreate.mockResolvedValue(MOCK_REPORT);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(429);
  });

  it("returns 200 with audit report shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(typeof data.id).toBe("string");
    expect(typeof data.overallScore).toBe("number");
    expect(typeof data.overallGrade).toBe("string");
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(typeof data.accountHealth).toBe("object");
    expect(typeof data.contentMix).toBe("object");
    expect(typeof data.postingPatterns).toBe("object");
    expect(typeof data.engagementBenchmarks).toBe("object");
    expect(typeof data.consistencyScore).toBe("object");
    expect(typeof data.topContent).toBe("object");
  });

  it("stores report in DB", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    await POST(makePostRequest());
    expect(mockAuditReportCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: MOCK_USER_ID }) })
    );
  });

  it("overall score is between 0 and 100", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await POST(makePostRequest());
    const data = (await res.json()) as { overallScore: number };
    expect(data.overallScore).toBeGreaterThanOrEqual(0);
    expect(data.overallScore).toBeLessThanOrEqual(100);
  });
});

describe("GET /api/analytics/audit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it("returns report list shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockAuditReportFindMany.mockResolvedValueOnce([
      { id: "r1", period: "30d", generatedAt: new Date("2026-08-20T12:00:00Z"), overallScore: 72 },
    ]);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const data = (await res.json()) as { reports: Array<{ id: string; overallScore: number }> };
    expect(Array.isArray(data.reports)).toBe(true);
    expect(data.reports).toHaveLength(1);
    expect(data.reports[0].id).toBe("r1");
    expect(data.reports[0].overallScore).toBe(72);
  });
});

describe("GET /api/analytics/audit/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getDetail(makeDetailRequest("report1"), {
      params: Promise.resolve({ id: "report1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when report not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockAuditReportFindUnique.mockResolvedValueOnce(null);

    const res = await getDetail(makeDetailRequest("nonexistent"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when report belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockAuditReportFindUnique.mockResolvedValueOnce({
      ...MOCK_REPORT,
      userId: "other-user",
    });

    const res = await getDetail(makeDetailRequest("report1"), {
      params: Promise.resolve({ id: "report1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns full report when found and owned", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockAuditReportFindUnique.mockResolvedValueOnce(MOCK_REPORT);

    const res = await getDetail(makeDetailRequest("report1"), {
      params: Promise.resolve({ id: "report1" }),
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.id).toBe("report1");
    expect(data.overallScore).toBe(72);
    expect(typeof data.overallGrade).toBe("string");
    expect(Array.isArray(data.recommendations)).toBe(true);
  });
});
