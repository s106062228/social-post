import { NextRequest } from "next/server";

jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

jest.mock("@prisma/client", () => ({
  ConversionType: {
    SALE: "SALE",
    LEAD: "LEAD",
    SIGNUP: "SIGNUP",
    DOWNLOAD: "DOWNLOAD",
    CLICK: "CLICK",
    OTHER: "OTHER",
  },
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
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
    contentConversion: {
      findMany: jest.fn(),
    },
  },
}));

import { GET } from "@/app/api/analytics/content-roi/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "user-1";
const AUTHED = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/analytics/content-roi");
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url.toString());
}

function makeConversion(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    userId: MOCK_USER_ID,
    postId: "post-1",
    type: "SALE",
    value: 100,
    currency: "USD",
    notes: null,
    occurredAt: new Date(),
    createdAt: new Date(),
    post: {
      id: "post-1",
      content: "Test post content for conversion tracking",
      status: "PUBLISHED",
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED);
  mockApiLimiter.mockResolvedValue(RL_OK);
  (prisma.contentConversion.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/analytics/content-roi", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    const res = await GET(makeGetRequest({ period: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns empty state with zeros when no conversions", async () => {
    (prisma.contentConversion.findMany as jest.Mock).mockResolvedValue([]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalConversions).toBe(0);
    expect(data.totalRevenue).toBe(0);
    expect(data.avgRevenue).toBe(0);
    expect(data.conversionsByType).toEqual([]);
    expect(data.topPostsByCount).toEqual([]);
    expect(data.topPostsByRevenue).toEqual([]);
  });

  it("returns correct totalConversions count", async () => {
    const conversions = [
      makeConversion({ id: "c-1" }),
      makeConversion({ id: "c-2", type: "LEAD" }),
      makeConversion({ id: "c-3", type: "SIGNUP" }),
    ];
    (prisma.contentConversion.findMany as jest.Mock).mockResolvedValue(conversions);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalConversions).toBe(3);
  });

  it("returns correct totalRevenue sum", async () => {
    const conversions = [
      makeConversion({ id: "c-1", value: 50 }),
      makeConversion({ id: "c-2", value: 150 }),
      makeConversion({ id: "c-3", value: null }),
    ];
    (prisma.contentConversion.findMany as jest.Mock).mockResolvedValue(conversions);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalRevenue).toBe(200);
  });

  it("computes avgRevenue only from value > 0 conversions", async () => {
    const conversions = [
      makeConversion({ id: "c-1", value: 100 }),
      makeConversion({ id: "c-2", value: 200 }),
      makeConversion({ id: "c-3", value: null }),
      makeConversion({ id: "c-4", value: 0 }),
    ];
    (prisma.contentConversion.findMany as jest.Mock).mockResolvedValue(conversions);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    // totalRevenue = 300, revenueConversions count = 2 (only value > 0)
    expect(data.avgRevenue).toBe(150);
  });

  it("groups conversions by type correctly", async () => {
    const conversions = [
      makeConversion({ id: "c-1", type: "SALE", value: 100 }),
      makeConversion({ id: "c-2", type: "SALE", value: 50 }),
      makeConversion({ id: "c-3", type: "LEAD", value: 0 }),
    ];
    (prisma.contentConversion.findMany as jest.Mock).mockResolvedValue(conversions);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversionsByType).toHaveLength(2);
    const sale = data.conversionsByType.find((t: { type: string }) => t.type === "SALE");
    expect(sale).toBeDefined();
    expect(sale.count).toBe(2);
    expect(sale.totalRevenue).toBe(150);
    const lead = data.conversionsByType.find((t: { type: string }) => t.type === "LEAD");
    expect(lead).toBeDefined();
    expect(lead.count).toBe(1);
  });

  it("returns topPostsByCount sorted by count descending", async () => {
    const conversions = [
      makeConversion({ id: "c-1", postId: "post-1", post: { id: "post-1", content: "Post A", status: "PUBLISHED" } }),
      makeConversion({ id: "c-2", postId: "post-2", post: { id: "post-2", content: "Post B", status: "PUBLISHED" } }),
      makeConversion({ id: "c-3", postId: "post-2", post: { id: "post-2", content: "Post B", status: "PUBLISHED" } }),
      makeConversion({ id: "c-4", postId: "post-2", post: { id: "post-2", content: "Post B", status: "PUBLISHED" } }),
    ];
    (prisma.contentConversion.findMany as jest.Mock).mockResolvedValue(conversions);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.topPostsByCount[0].postId).toBe("post-2");
    expect(data.topPostsByCount[0].count).toBe(3);
    expect(data.topPostsByCount[1].postId).toBe("post-1");
    expect(data.topPostsByCount[1].count).toBe(1);
  });

  it("returns topPostsByRevenue sorted by totalRevenue descending", async () => {
    const conversions = [
      makeConversion({ id: "c-1", postId: "post-1", value: 500, post: { id: "post-1", content: "Post A", status: "PUBLISHED" } }),
      makeConversion({ id: "c-2", postId: "post-2", value: 50, post: { id: "post-2", content: "Post B", status: "PUBLISHED" } }),
      makeConversion({ id: "c-3", postId: "post-2", value: 50, post: { id: "post-2", content: "Post B", status: "PUBLISHED" } }),
    ];
    (prisma.contentConversion.findMany as jest.Mock).mockResolvedValue(conversions);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    // post-1 has 500 revenue, post-2 has 100 revenue
    expect(data.topPostsByRevenue[0].postId).toBe("post-1");
    expect(data.topPostsByRevenue[0].totalRevenue).toBe(500);
    expect(data.topPostsByRevenue[1].postId).toBe("post-2");
    expect(data.topPostsByRevenue[1].totalRevenue).toBe(100);
  });

  it("returns period and currency in response", async () => {
    const res = await GET(makeGetRequest({ period: "7d" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.period).toBe("7d");
    expect(data.currency).toBe("USD");
  });
});
