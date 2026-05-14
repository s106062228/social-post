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
    brandKit: { findUnique: jest.fn() },
    post: { findUnique: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { POST as checkCompliance } from "@/app/api/brand-compliance/route";
import { POST as checkPostCompliance } from "@/app/api/posts/[id]/check-compliance/route";
import { checkBrandCompliance } from "@/lib/brand-compliance";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockBrandKitFindUnique = prisma.brandKit.findUnique as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED = { user: { id: MOCK_USER_ID, email: "u@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const POST_ID = "clh3ck8zp0001qr5hyvxckahk";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/brand-compliance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${POST_ID}/check-compliance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Unit tests for brand-compliance utility ──────────────────────────────────

describe("checkBrandCompliance utility", () => {
  it("returns compliant with score 100 for clean content", () => {
    const result = checkBrandCompliance("Our innovative approach is friendly and professional.", {
      doKeywords: ["innovative"],
      dontKeywords: ["cheap"],
    });
    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("detects forbidden keyword", () => {
    const result = checkBrandCompliance("Get it for free today!", {
      doKeywords: [],
      dontKeywords: ["free"],
    });
    expect(result.compliant).toBe(false);
    const forbidden = result.violations.find((v) => v.type === "forbidden");
    expect(forbidden).toBeDefined();
    expect(forbidden?.keyword).toBe("free");
  });

  it("detects multiple forbidden keywords", () => {
    const result = checkBrandCompliance("Cheap and free solution.", {
      doKeywords: [],
      dontKeywords: ["cheap", "free"],
    });
    const forbidden = result.violations.filter((v) => v.type === "forbidden");
    expect(forbidden).toHaveLength(2);
  });

  it("detects missing do keyword", () => {
    const result = checkBrandCompliance("We sell products online.", {
      doKeywords: ["innovative", "professional"],
      dontKeywords: [],
    });
    const missing = result.violations.find((v) => v.type === "missing_do");
    expect(missing).toBeDefined();
  });

  it("does not warn about missing do keywords when list is empty", () => {
    const result = checkBrandCompliance("Some content here to read.", {
      doKeywords: [],
      dontKeywords: [],
    });
    const missing = result.violations.filter((v) => v.type === "missing_do");
    expect(missing).toHaveLength(0);
  });

  it("detects too-short content", () => {
    const result = checkBrandCompliance("Hi", {
      doKeywords: [],
      dontKeywords: [],
    });
    const short = result.violations.find((v) => v.type === "too_short");
    expect(short).toBeDefined();
  });

  it("returns combined violations", () => {
    const result = checkBrandCompliance("Free!", {
      doKeywords: ["innovative"],
      dontKeywords: ["free"],
    });
    expect(result.compliant).toBe(false);
    expect(result.violations.length).toBeGreaterThan(1);
  });

  it("score is 0-100 and never negative", () => {
    const result = checkBrandCompliance("Hi", {
      doKeywords: ["innovative"],
      dontKeywords: ["cheap", "free"],
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ── API tests for POST /api/brand-compliance ─────────────────────────────────

describe("POST /api/brand-compliance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockBrandKitFindUnique.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await checkCompliance(makeRequest({ content: "hello world test content" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await checkCompliance(makeRequest({ content: "hello world test content" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid body", async () => {
    const res = await checkCompliance(makeRequest({ wrong: "field" }));
    expect(res.status).toBe(400);
  });

  it("returns compliant=true with score 100 when no brand kit configured", async () => {
    mockBrandKitFindUnique.mockResolvedValue(null);
    const res = await checkCompliance(makeRequest({ content: "Some interesting content here." }));
    expect(res.status).toBe(200);
    const body = await res.json() as { compliant: boolean; score: number; violations: unknown[] };
    expect(body.compliant).toBe(true);
    expect(body.score).toBe(100);
    expect(body.violations).toHaveLength(0);
  });

  it("returns violations for forbidden keyword", async () => {
    mockBrandKitFindUnique.mockResolvedValue({ doKeywords: [], dontKeywords: ["spam"] });
    const res = await checkCompliance(makeRequest({ content: "This is spam content here." }));
    expect(res.status).toBe(200);
    const body = await res.json() as { compliant: boolean; violations: { type: string }[] };
    expect(body.compliant).toBe(false);
    expect(body.violations.some((v) => v.type === "forbidden")).toBe(true);
  });

  it("returns compliant for clean content with brand kit", async () => {
    mockBrandKitFindUnique.mockResolvedValue({
      doKeywords: ["innovative"],
      dontKeywords: ["cheap"],
    });
    const res = await checkCompliance(
      makeRequest({ content: "Our innovative platform helps you grow." })
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { compliant: boolean };
    expect(body.compliant).toBe(true);
  });
});

// ── API tests for POST /api/posts/[id]/check-compliance ──────────────────────

describe("POST /api/posts/[id]/check-compliance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockPostFindUnique.mockResolvedValue({
      id: POST_ID,
      userId: MOCK_USER_ID,
      content: "Our innovative approach is great.",
    });
    mockBrandKitFindUnique.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await checkPostCompliance(makePostRequest({}), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await checkPostCompliance(makePostRequest({}), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for non-existent post", async () => {
    mockPostFindUnique.mockResolvedValue(null);
    const res = await checkPostCompliance(makePostRequest({}), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for post owned by another user", async () => {
    mockPostFindUnique.mockResolvedValue({
      id: POST_ID,
      userId: "other-user-id",
      content: "Content",
    });
    const res = await checkPostCompliance(makePostRequest({}), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns compliant=true when no brand kit", async () => {
    mockBrandKitFindUnique.mockResolvedValue(null);
    const res = await checkPostCompliance(makePostRequest({}), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { compliant: boolean; score: number };
    expect(body.compliant).toBe(true);
    expect(body.score).toBe(100);
  });

  it("returns violations when brand kit has forbidden keywords", async () => {
    mockBrandKitFindUnique.mockResolvedValue({
      doKeywords: [],
      dontKeywords: ["innovative"],
    });
    const res = await checkPostCompliance(makePostRequest({}), {
      params: Promise.resolve({ id: POST_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { compliant: boolean; violations: { type: string }[] };
    expect(body.compliant).toBe(false);
    expect(body.violations.some((v) => v.type === "forbidden")).toBe(true);
  });
});
