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
    competitorContentAnalysis: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    brandKit: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

jest.mock("@/lib/ai", () => ({
  analyzeCompetitorContent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { DELETE } from "../[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { analyzeCompetitorContent } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.competitorContentAnalysis.findMany as jest.Mock;
const mockCount = prisma.competitorContentAnalysis.count as jest.Mock;
const mockCreate = prisma.competitorContentAnalysis.create as jest.Mock;
const mockFindUnique = prisma.competitorContentAnalysis.findUnique as jest.Mock;
const mockDelete = prisma.competitorContentAnalysis.delete as jest.Mock;
const mockBrandKitFind = prisma.brandKit.findUnique as jest.Mock;
const mockAnalyze = analyzeCompetitorContent as jest.Mock;

const AUTHED = { user: { id: "user-1" } };

const sampleAnalysis = {
  contentStrategy: "Focus on value-driven content",
  strengths: ["Strong CTAs", "Visual storytelling"],
  weaknesses: ["Too promotional"],
  keyTechniques: ["Storytelling", "Social proof"],
  toneStyle: "Professional yet approachable",
  targetAudience: "Marketing professionals",
  estimatedEngagementScore: 75,
  actionableInsights: ["Use more questions", "Add hashtags"],
};

const sampleRecord = {
  id: "analysis-1",
  userId: "user-1",
  competitorName: "Acme Corp",
  platform: "INSTAGRAM",
  content: "Check out our latest product launch! #marketing",
  analysis: sampleAnalysis,
  createdAt: new Date("2026-01-01T10:00:00Z"),
};

function makeReq(url: string, opts?: { method?: string; body?: unknown }): NextRequest {
  return new NextRequest(url, {
    method: opts?.method ?? "GET",
    headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLimiter.mockResolvedValue(null);
  mockBrandKitFind.mockResolvedValue(null);
});

// ─── GET tests ───────────────────────────────────────────────────────────────

describe("GET /api/competitor-intelligence", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq("http://localhost/api/competitor-intelligence"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue({ success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 });
    const res = await GET(makeReq("http://localhost/api/competitor-intelligence"));
    expect(res.status).toBe(429);
  });

  it("returns empty array when no analyses", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/competitor-intelligence"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { analyses: unknown[] };
    expect(data.analyses).toEqual([]);
  });

  it("returns analyses with content truncated to 200 chars", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    const longContent = "A".repeat(500);
    mockFindMany.mockResolvedValue([{ ...sampleRecord, content: longContent }]);
    const res = await GET(makeReq("http://localhost/api/competitor-intelligence"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { analyses: Array<{ content: string }> };
    expect(data.analyses[0].content).toHaveLength(200);
  });
});

// ─── POST tests ──────────────────────────────────────────────────────────────

describe("POST /api/competitor-intelligence", () => {
  const validBody = {
    competitorName: "Acme Corp",
    content: "Check out our latest product launch! #marketing",
    platform: "INSTAGRAM",
  };

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq("http://localhost/api/competitor-intelligence", { method: "POST", body: validBody }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue({ success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 });
    const res = await POST(makeReq("http://localhost/api/competitor-intelligence", { method: "POST", body: validBody }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI not configured", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeReq("http://localhost/api/competitor-intelligence", { method: "POST", body: validBody }));
    expect(res.status).toBe(503);
    if (savedKey) process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await POST(makeReq("http://localhost/api/competitor-intelligence", { method: "POST", body: { competitorName: "" } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content too short", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await POST(makeReq("http://localhost/api/competitor-intelligence", {
      method: "POST",
      body: { competitorName: "Acme", content: "short" },
    }));
    expect(res.status).toBe(400);
  });

  it("creates and returns analysis on success", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCount.mockResolvedValue(0);
    mockAnalyze.mockResolvedValue(sampleAnalysis);
    mockCreate.mockResolvedValue(sampleRecord);
    const res = await POST(makeReq("http://localhost/api/competitor-intelligence", { method: "POST", body: validBody }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; competitorName: string; analysis: typeof sampleAnalysis };
    expect(data.id).toBe("analysis-1");
    expect(data.competitorName).toBe("Acme Corp");
    expect(data.analysis.estimatedEngagementScore).toBe(75);
  });

  it("returns 503 when AI returns null", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCount.mockResolvedValue(0);
    mockAnalyze.mockResolvedValue(null);
    const res = await POST(makeReq("http://localhost/api/competitor-intelligence", { method: "POST", body: validBody }));
    expect(res.status).toBe(503);
  });
});

// ─── DELETE tests ─────────────────────────────────────────────────────────────

describe("DELETE /api/competitor-intelligence/[id]", () => {
  function makeDeleteReq(id: string): NextRequest {
    return new NextRequest(`http://localhost/api/competitor-intelligence/${id}`, { method: "DELETE" });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeDeleteReq("analysis-1"), { params: Promise.resolve({ id: "analysis-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockFindUnique.mockResolvedValue(null);
    const res = await DELETE(makeDeleteReq("analysis-x"), { params: Promise.resolve({ id: "analysis-x" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when owned by another user", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockFindUnique.mockResolvedValue({ ...sampleRecord, userId: "other-user" });
    const res = await DELETE(makeDeleteReq("analysis-1"), { params: Promise.resolve({ id: "analysis-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 204 on success", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockFindUnique.mockResolvedValue(sampleRecord);
    mockDelete.mockResolvedValue(sampleRecord);
    const res = await DELETE(makeDeleteReq("analysis-1"), { params: Promise.resolve({ id: "analysis-1" }) });
    expect(res.status).toBe(204);
  });
});
