import { NextRequest } from "next/server";

jest.mock("@prisma/client", () => ({
  PublishStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PUBLISHED: "PUBLISHED",
    FAILED: "FAILED",
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    post: { groupBy: jest.fn() },
    publishResult: { findMany: jest.fn() },
    socialAccount: { count: jest.fn() },
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  pdfExportLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));
jest.mock("@/lib/pdf-report", () => ({
  generateAnalyticsPdf: jest.fn(),
}));
jest.mock("@/lib/activity-log", () => ({ logActivity: jest.fn() }));
jest.mock("@/lib/posting-frequency", () => ({
  computePlatformFrequency: jest.fn(() => []),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { pdfExportLimiter } from "@/lib/rate-limit";
import { generateAnalyticsPdf } from "@/lib/pdf-report";
import { logActivity } from "@/lib/activity-log";
import { GET } from "@/app/api/analytics/export-pdf/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockRl = pdfExportLimiter as jest.MockedFunction<typeof pdfExportLimiter>;
const mockGenPdf = generateAnalyticsPdf as jest.MockedFunction<typeof generateAnalyticsPdf>;
const mockLogActivity = logActivity as jest.MockedFunction<typeof logActivity>;

const rlAllow = { success: true, limit: 10, remaining: 9, resetAt: new Date() };
const rlDeny = { success: false, limit: 10, remaining: 0, resetAt: new Date() };

function makeReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/analytics/export-pdf");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.post.groupBy as jest.Mock).mockResolvedValue([]);
  (prisma.publishResult.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.socialAccount.count as jest.Mock).mockResolvedValue(0);
  mockGenPdf.mockResolvedValue(Buffer.from("%PDF-1.4 mock content"));
});

describe("GET /api/analytics/export-pdf", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as never);
    mockRl.mockResolvedValue(rlDeny);
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
  });

  it("returns 200 with PDF content-type", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    const res = await GET(makeReq({ period: "30d" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("sets content-disposition with correct filename format", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    const res = await GET(makeReq({ period: "7d" }));
    const disp = res.headers.get("Content-Disposition") ?? "";
    expect(disp).toMatch(/attachment/);
    expect(disp).toMatch(/postflow-report/);
    expect(disp).toMatch(/7d\.pdf/);
  });

  it("response body starts with %PDF magic bytes", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    const res = await GET(makeReq());
    const body = await res.text();
    expect(body).toMatch(/^%PDF/);
  });

  it("falls back to 30d for invalid period param", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    const res = await GET(makeReq({ period: "badvalue" }));
    // zod default produces 30d, should succeed
    expect(res.status).toBe(200);
  });

  it("passes user email to generateAnalyticsPdf", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", email: "user@example.com" },
    } as never);
    mockRl.mockResolvedValue(rlAllow);
    await GET(makeReq({ period: "30d" }));
    expect(mockGenPdf).toHaveBeenCalledWith(
      expect.objectContaining({ userEmail: "user@example.com" })
    );
  });

  it("logs analytics.exported activity", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as never);
    mockRl.mockResolvedValue(rlAllow);
    await GET(makeReq({ period: "30d" }));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "analytics.exported" })
    );
  });
});
