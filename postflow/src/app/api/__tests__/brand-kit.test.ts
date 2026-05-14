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
    brandKit: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as getBrandKit, PATCH as patchBrandKit } from "@/app/api/brand-kit/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindUnique = prisma.brandKit.findUnique as jest.Mock;
const mockUpsert = prisma.brandKit.upsert as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_BRAND_KIT = {
  id: "bk1",
  userId: MOCK_USER_ID,
  primaryColor: "#3b82f6",
  secondaryColor: "#8b5cf6",
  accentColor: "#f59e0b",
  logoUrl: "https://example.com/logo.png",
  tagline: "Empowering creators",
  voiceGuide: "Be friendly and professional.",
  doKeywords: ["innovative", "friendly"],
  dontKeywords: ["cheap", "free"],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/brand-kit", { method: "GET" });
}

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/brand-kit", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
});

// ── GET /api/brand-kit ────────────────────────────────────────────────────────

describe("GET /api/brand-kit", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getBrandKit(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await getBrandKit(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it("returns null when no brand kit exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await getBrandKit(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeNull();
  });

  it("returns existing brand kit with correct shape", async () => {
    mockFindUnique.mockResolvedValue(MOCK_BRAND_KIT);
    const res = await getBrandKit(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as typeof MOCK_BRAND_KIT;
    expect(body.primaryColor).toBe("#3b82f6");
    expect(body.doKeywords).toEqual(["innovative", "friendly"]);
    expect(body.dontKeywords).toEqual(["cheap", "free"]);
    expect(body.tagline).toBe("Empowering creators");
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });
});

// ── PATCH /api/brand-kit ──────────────────────────────────────────────────────

describe("PATCH /api/brand-kit", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await patchBrandKit(makePatchRequest({ primaryColor: "#ff0000" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await patchBrandKit(makePatchRequest({ primaryColor: "#ff0000" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid hex color", async () => {
    const res = await patchBrandKit(makePatchRequest({ primaryColor: "notacolor" }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for invalid URL in logoUrl", async () => {
    const res = await patchBrandKit(makePatchRequest({ logoUrl: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("creates brand kit (upsert) and returns it", async () => {
    mockUpsert.mockResolvedValue({
      ...MOCK_BRAND_KIT,
      primaryColor: "#ff0000",
      doKeywords: ["bold"],
      dontKeywords: [],
    });

    const res = await patchBrandKit(
      makePatchRequest({ primaryColor: "#ff0000", doKeywords: ["bold"], dontKeywords: [] })
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { primaryColor: string; doKeywords: string[] };
    expect(body.primaryColor).toBe("#ff0000");
    expect(body.doKeywords).toEqual(["bold"]);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID },
        create: expect.objectContaining({ userId: MOCK_USER_ID, primaryColor: "#ff0000" }),
      })
    );
  });

  it("updates existing brand kit", async () => {
    const updated = { ...MOCK_BRAND_KIT, tagline: "New tagline" };
    mockUpsert.mockResolvedValue(updated);

    const res = await patchBrandKit(makePatchRequest({ tagline: "New tagline" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { tagline: string };
    expect(body.tagline).toBe("New tagline");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ tagline: "New tagline" }),
      })
    );
  });

  it("accepts null values to clear fields", async () => {
    const cleared = { ...MOCK_BRAND_KIT, primaryColor: null, tagline: null };
    mockUpsert.mockResolvedValue(cleared);

    const res = await patchBrandKit(
      makePatchRequest({ primaryColor: null, tagline: null })
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { primaryColor: null; tagline: null };
    expect(body.primaryColor).toBeNull();
    expect(body.tagline).toBeNull();
  });

  it("accepts full brand kit update", async () => {
    mockUpsert.mockResolvedValue(MOCK_BRAND_KIT);

    const res = await patchBrandKit(
      makePatchRequest({
        primaryColor: "#3b82f6",
        secondaryColor: "#8b5cf6",
        accentColor: "#f59e0b",
        logoUrl: "https://example.com/logo.png",
        tagline: "Empowering creators",
        voiceGuide: "Be friendly and professional.",
        doKeywords: ["innovative", "friendly"],
        dontKeywords: ["cheap", "free"],
      })
    );
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });
});
