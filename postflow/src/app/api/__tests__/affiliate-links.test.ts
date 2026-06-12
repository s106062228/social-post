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
    affiliateLink: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listLinks, POST as createLink } from "@/app/api/affiliate-links/route";
import {
  PATCH as updateLink,
  DELETE as deleteLink,
} from "@/app/api/affiliate-links/[id]/route";
import { POST as trackClick } from "@/app/api/affiliate-links/[id]/track-click/route";
import { PATCH as recordConversion } from "@/app/api/affiliate-links/[id]/record-conversion/route";
import { GET as getRevenueAnalytics } from "@/app/api/analytics/affiliate-revenue/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.affiliateLink.findMany as jest.Mock;
const mockFindUnique = prisma.affiliateLink.findUnique as jest.Mock;
const mockCreate = prisma.affiliateLink.create as jest.Mock;
const mockCount = prisma.affiliateLink.count as jest.Mock;
const mockDelete = prisma.affiliateLink.delete as jest.Mock;
const mockUpdate = prisma.affiliateLink.update as jest.Mock;

const MOCK_USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const LINK_ID = "link-1";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_LINK = {
  id: LINK_ID,
  userId: MOCK_USER_ID,
  name: "Amazon Associates",
  originalUrl: "https://amazon.com/product",
  affiliateCode: "mycode",
  platform: "Amazon",
  category: "Tech",
  clicks: 10,
  conversions: 2,
  revenue: 50.0,
  currency: "USD",
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
});

// ── GET /api/affiliate-links ──────────────────────────────────────────────────

describe("GET /api/affiliate-links", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listLinks();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await listLinks();
    expect(res.status).toBe(429);
  });

  it("returns empty list when user has no links", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await listLinks();
    expect(res.status).toBe(200);
    const body = await res.json() as { links: unknown[] };
    expect(body.links).toEqual([]);
  });

  it("returns links sorted by createdAt desc", async () => {
    mockFindMany.mockResolvedValue([BASE_LINK]);
    const res = await listLinks();
    expect(res.status).toBe(200);
    const body = await res.json() as { links: typeof BASE_LINK[] };
    expect(body.links).toHaveLength(1);
    expect(body.links[0].name).toBe("Amazon Associates");
  });
});

// ── POST /api/affiliate-links ─────────────────────────────────────────────────

describe("POST /api/affiliate-links", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/affiliate-links", {
      method: "POST",
      body: JSON.stringify({ name: "Test", originalUrl: "https://example.com" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const req = makeRequest("http://localhost/api/affiliate-links", {
      method: "POST",
      body: JSON.stringify({ name: "Test", originalUrl: "https://example.com" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(429);
  });

  it("returns 422 when at max limit", async () => {
    mockCount.mockResolvedValue(200);
    const req = makeRequest("http://localhost/api/affiliate-links", {
      method: "POST",
      body: JSON.stringify({ name: "Test", originalUrl: "https://example.com" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid URL", async () => {
    mockCount.mockResolvedValue(0);
    const req = makeRequest("http://localhost/api/affiliate-links", {
      method: "POST",
      body: JSON.stringify({ name: "Test", originalUrl: "not-a-url" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(400);
  });

  it("creates affiliate link and returns 201", async () => {
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue(BASE_LINK);
    const req = makeRequest("http://localhost/api/affiliate-links", {
      method: "POST",
      body: JSON.stringify({
        name: "Amazon Associates",
        originalUrl: "https://amazon.com/product",
        affiliateCode: "mycode",
        platform: "Amazon",
        category: "Tech",
        currency: "USD",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(201);
    const body = await res.json() as { link: typeof BASE_LINK };
    expect(body.link.name).toBe("Amazon Associates");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_USER_ID,
          affiliateCode: "mycode",
        }),
      })
    );
  });
});

// ── PATCH /api/affiliate-links/[id] ──────────────────────────────────────────

describe("PATCH /api/affiliate-links/[id]", () => {
  it("returns 404 when not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/affiliate-links/bad-id", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await updateLink(req, { params: Promise.resolve({ id: "bad-id" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when owned by another user", async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_LINK, userId: OTHER_USER_ID });
    const req = makeRequest(`http://localhost/api/affiliate-links/${LINK_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await updateLink(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(403);
  });

  it("updates link successfully", async () => {
    mockFindUnique.mockResolvedValue(BASE_LINK);
    const updated = { ...BASE_LINK, name: "Updated Name", isActive: false };
    mockUpdate.mockResolvedValue(updated);
    const req = makeRequest(`http://localhost/api/affiliate-links/${LINK_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated Name", isActive: false }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await updateLink(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { link: typeof updated };
    expect(body.link.name).toBe("Updated Name");
  });
});

// ── DELETE /api/affiliate-links/[id] ─────────────────────────────────────────

describe("DELETE /api/affiliate-links/[id]", () => {
  it("returns 404 when not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/affiliate-links/bad-id", {
      method: "DELETE",
    });
    const res = await deleteLink(req, { params: Promise.resolve({ id: "bad-id" }) });
    expect(res.status).toBe(404);
  });

  it("deletes link and returns 204", async () => {
    mockFindUnique.mockResolvedValue(BASE_LINK);
    mockDelete.mockResolvedValue(BASE_LINK);
    const req = makeRequest(`http://localhost/api/affiliate-links/${LINK_ID}`, {
      method: "DELETE",
    });
    const res = await deleteLink(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: LINK_ID } });
  });
});

// ── POST /api/affiliate-links/[id]/track-click (public) ──────────────────────

describe("POST /api/affiliate-links/[id]/track-click", () => {
  it("returns 404 when link not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = makeRequest(`http://localhost/api/affiliate-links/${LINK_ID}/track-click`, {
      method: "POST",
    });
    const res = await trackClick(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when link is inactive", async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_LINK, isActive: false });
    const req = makeRequest(`http://localhost/api/affiliate-links/${LINK_ID}/track-click`, {
      method: "POST",
    });
    const res = await trackClick(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(404);
  });

  it("increments click count and returns new total", async () => {
    mockFindUnique.mockResolvedValue(BASE_LINK);
    mockUpdate.mockResolvedValue({ clicks: 11 });
    const req = makeRequest(`http://localhost/api/affiliate-links/${LINK_ID}/track-click`, {
      method: "POST",
    });
    const res = await trackClick(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { clicks: number };
    expect(body.clicks).toBe(11);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { clicks: { increment: 1 } },
      })
    );
  });
});

// ── PATCH /api/affiliate-links/[id]/record-conversion ────────────────────────

describe("PATCH /api/affiliate-links/[id]/record-conversion", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest(`http://localhost/api/affiliate-links/${LINK_ID}/record-conversion`, {
      method: "PATCH",
      body: JSON.stringify({ revenue: 25 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await recordConversion(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const req = makeRequest(`http://localhost/api/affiliate-links/${LINK_ID}/record-conversion`, {
      method: "PATCH",
      body: JSON.stringify({ revenue: 25 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await recordConversion(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when link not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = makeRequest(`http://localhost/api/affiliate-links/${LINK_ID}/record-conversion`, {
      method: "PATCH",
      body: JSON.stringify({ revenue: 25 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await recordConversion(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(404);
  });

  it("records conversion with revenue and returns totals", async () => {
    mockFindUnique.mockResolvedValue(BASE_LINK);
    mockUpdate.mockResolvedValue({ conversions: 3, revenue: 75.0 });
    const req = makeRequest(`http://localhost/api/affiliate-links/${LINK_ID}/record-conversion`, {
      method: "PATCH",
      body: JSON.stringify({ revenue: 25 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await recordConversion(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { conversions: number; revenue: number };
    expect(body.conversions).toBe(3);
    expect(body.revenue).toBe(75.0);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          conversions: { increment: 1 },
          revenue: { increment: 25 },
        },
      })
    );
  });

  it("records conversion without revenue (defaults to 0)", async () => {
    mockFindUnique.mockResolvedValue(BASE_LINK);
    mockUpdate.mockResolvedValue({ conversions: 3, revenue: 50.0 });
    const req = makeRequest(`http://localhost/api/affiliate-links/${LINK_ID}/record-conversion`, {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await recordConversion(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          conversions: { increment: 1 },
          revenue: { increment: 0 },
        },
      })
    );
  });
});

// ── GET /api/analytics/affiliate-revenue ─────────────────────────────────────

describe("GET /api/analytics/affiliate-revenue", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/analytics/affiliate-revenue");
    const res = await getRevenueAnalytics(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const req = makeRequest("http://localhost/api/analytics/affiliate-revenue");
    const res = await getRevenueAnalytics(req);
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    const req = makeRequest("http://localhost/api/analytics/affiliate-revenue?period=invalid");
    const res = await getRevenueAnalytics(req);
    expect(res.status).toBe(400);
  });

  it("returns aggregate stats and link breakdown", async () => {
    mockFindMany.mockResolvedValue([
      BASE_LINK,
      { ...BASE_LINK, id: "link-2", name: "ShareASale", clicks: 5, conversions: 1, revenue: 20.0 },
    ]);
    const req = makeRequest("http://localhost/api/analytics/affiliate-revenue?period=30d");
    const res = await getRevenueAnalytics(req);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      totalClicks: number;
      totalConversions: number;
      totalRevenue: number;
      conversionRate: number;
      links: Array<{ id: string; conversionRate: number }>;
    };
    expect(body.period).toBe("30d");
    expect(body.totalClicks).toBe(15);
    expect(body.totalConversions).toBe(3);
    expect(body.totalRevenue).toBe(70.0);
    expect(body.conversionRate).toBeCloseTo(20, 0);
    expect(body.links).toHaveLength(2);
    // sorted by revenue desc: BASE_LINK (50) before ShareASale (20)
    expect(body.links[0].id).toBe(LINK_ID);
  });

  it("returns zero conversionRate when no clicks", async () => {
    mockFindMany.mockResolvedValue([{ ...BASE_LINK, clicks: 0, conversions: 0, revenue: 0 }]);
    const req = makeRequest("http://localhost/api/analytics/affiliate-revenue");
    const res = await getRevenueAnalytics(req);
    const body = await res.json() as { conversionRate: number };
    expect(body.conversionRate).toBe(0);
  });

  it("period=all passes no date filter", async () => {
    mockFindMany.mockResolvedValue([]);
    const req = makeRequest("http://localhost/api/analytics/affiliate-revenue?period=all");
    const res = await getRevenueAnalytics(req);
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID },
      })
    );
  });
});
