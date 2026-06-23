import { NextRequest } from "next/server";
import { GET, PATCH } from "../route";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    whitelabelConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockFindUnique = prisma.whitelabelConfig.findUnique as jest.MockedFunction<
  typeof prisma.whitelabelConfig.findUnique
>;
const mockUpsert = prisma.whitelabelConfig.upsert as jest.MockedFunction<
  typeof prisma.whitelabelConfig.upsert
>;
const mockLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;

const fakeConfig = {
  id: "wl-1",
  userId: "user-1",
  appName: "Acme Social",
  logoUrl: "https://example.com/logo.png",
  primaryColor: "#ff6600",
  accentColor: "#0066ff",
  emailSignature: "Powered by Acme",
  faviconUrl: "https://example.com/favicon.ico",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/whitelabel", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetReq(): NextRequest {
  return new NextRequest("http://localhost/api/whitelabel");
}

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAuth.mockResolvedValue({ user: { id: "user-1" } } as any);
  mockLimiter.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
});

// ── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/whitelabel", () => {
  it("returns 401 when unauthenticated", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue(null as any);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await GET(makeGetReq());
    expect(res.status).toBe(429);
  });

  it("returns defaults when no config row exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.appName).toBe("PostFlow");
    expect(body.primaryColor).toBe("#6366f1");
    expect(body.accentColor).toBe("#8b5cf6");
    expect(body.logoUrl).toBeNull();
  });

  it("returns stored config when row exists", async () => {
    mockFindUnique.mockResolvedValue(fakeConfig);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.appName).toBe("Acme Social");
    expect(body.logoUrl).toBe("https://example.com/logo.png");
    expect(body.primaryColor).toBe("#ff6600");
  });
});

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/whitelabel", () => {
  it("returns 401 when unauthenticated", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue(null as any);
    const res = await PATCH(makeReq({ appName: "Acme" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await PATCH(makeReq({ appName: "Acme" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid hex color", async () => {
    const res = await PATCH(makeReq({ primaryColor: "not-a-color" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.issues).toBeDefined();
  });

  it("returns 400 when appName exceeds 50 characters", async () => {
    const res = await PATCH(makeReq({ appName: "A".repeat(51) }));
    expect(res.status).toBe(400);
  });

  it("upserts and returns the updated config", async () => {
    mockUpsert.mockResolvedValue({
      ...fakeConfig,
      appName: "New Name",
      primaryColor: "#123456",
    });
    const res = await PATCH(makeReq({ appName: "New Name", primaryColor: "#123456" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.appName).toBe("New Name");
    expect(body.primaryColor).toBe("#123456");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
      })
    );
  });

  it("allows clearing optional fields with null", async () => {
    mockUpsert.mockResolvedValue({
      ...fakeConfig,
      logoUrl: null,
      emailSignature: null,
    });
    const res = await PATCH(makeReq({ logoUrl: null, emailSignature: null }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.logoUrl).toBeNull();
    expect(body.emailSignature).toBeNull();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/whitelabel", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid logoUrl", async () => {
    const res = await PATCH(makeReq({ logoUrl: "not-a-url" }));
    expect(res.status).toBe(400);
  });
});
