jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
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
    contentDigestConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/settings/content-digest/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindUnique = prisma.contentDigestConfig.findUnique as jest.Mock;
const mockUpsert = prisma.contentDigestConfig.upsert as jest.Mock;

const USER_ID = "cluser0001";
const SESSION = { user: { id: USER_ID } };
const RL_OK = { success: true };
const RL_FAIL = { success: false };

const STORED_CONFIG = {
  enabled: true,
  dayOfWeek: 2,
  hourUTC: 10,
  lookAheadDays: 14,
  includeContent: false,
};

const DEFAULT_CONFIG = {
  enabled: false,
  dayOfWeek: 1,
  hourUTC: 9,
  lookAheadDays: 7,
  includeContent: true,
};

function makeRequest(method = "GET", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/settings/content-digest", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockApiLimiter.mockResolvedValue(RL_OK);
  mockFindUnique.mockResolvedValue(null);
  mockUpsert.mockResolvedValue(STORED_CONFIG);
});

// ── GET tests ──────────────────────────────────────────────────────────────────

describe("GET /api/settings/content-digest", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns default config when no row exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data).toEqual(DEFAULT_CONFIG);
  });

  it("returns stored config when a row exists", async () => {
    mockFindUnique.mockResolvedValue(STORED_CONFIG);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data).toEqual(STORED_CONFIG);
  });

  it("returns correct shape with all expected fields", async () => {
    mockFindUnique.mockResolvedValue(STORED_CONFIG);
    const res = await GET(makeRequest());
    const data = await res.json() as Record<string, unknown>;
    expect(data).toHaveProperty("enabled");
    expect(data).toHaveProperty("dayOfWeek");
    expect(data).toHaveProperty("hourUTC");
    expect(data).toHaveProperty("lookAheadDays");
    expect(data).toHaveProperty("includeContent");
  });
});

// ── PATCH tests ────────────────────────────────────────────────────────────────

describe("PATCH /api/settings/content-digest", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeRequest("PATCH", { enabled: true }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await PATCH(makeRequest("PATCH", { enabled: true }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid body (dayOfWeek out of range)", async () => {
    const res = await PATCH(makeRequest("PATCH", { dayOfWeek: 7 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid hourUTC out of range", async () => {
    const res = await PATCH(makeRequest("PATCH", { hourUTC: 24 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid lookAheadDays (0 is too low)", async () => {
    const res = await PATCH(makeRequest("PATCH", { lookAheadDays: 0 }));
    expect(res.status).toBe(400);
  });

  it("upserts and returns updated config when enabled=true", async () => {
    mockUpsert.mockResolvedValue({ ...DEFAULT_CONFIG, enabled: true });
    const res = await PATCH(makeRequest("PATCH", { enabled: true }));
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.enabled).toBe(true);
  });

  it("upserts with partial fields (only dayOfWeek)", async () => {
    const updated = { ...STORED_CONFIG, dayOfWeek: 5 };
    mockUpsert.mockResolvedValue(updated);
    const res = await PATCH(makeRequest("PATCH", { dayOfWeek: 5 }));
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.dayOfWeek).toBe(5);
  });

  it("calls prisma.contentDigestConfig.upsert with correct userId", async () => {
    const res = await PATCH(makeRequest("PATCH", { enabled: false }));
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
      })
    );
  });

  it("accepts all valid fields in one PATCH", async () => {
    const payload = {
      enabled: true,
      dayOfWeek: 3,
      hourUTC: 14,
      lookAheadDays: 5,
      includeContent: false,
    };
    mockUpsert.mockResolvedValue(payload);
    const res = await PATCH(makeRequest("PATCH", payload));
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data).toEqual(payload);
  });

  it("accepts lookAheadDays=30 (max boundary)", async () => {
    mockUpsert.mockResolvedValue({ ...DEFAULT_CONFIG, lookAheadDays: 30 });
    const res = await PATCH(makeRequest("PATCH", { lookAheadDays: 30 }));
    expect(res.status).toBe(200);
  });

  it("returns 400 for lookAheadDays=31 (above max)", async () => {
    const res = await PATCH(makeRequest("PATCH", { lookAheadDays: 31 }));
    expect(res.status).toBe(400);
  });
});
