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
    utmPreset: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { GET as listPresets, POST as createPreset } from "@/app/api/utm-presets/route";
import { DELETE as deletePreset } from "@/app/api/utm-presets/[id]/route";
import { PATCH as setDefault } from "@/app/api/utm-presets/[id]/set-default/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.utmPreset.findMany as jest.Mock;
const mockFindUnique = prisma.utmPreset.findUnique as jest.Mock;
const mockCreate = prisma.utmPreset.create as jest.Mock;
const mockCount = prisma.utmPreset.count as jest.Mock;
const mockDelete = prisma.utmPreset.delete as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_PRESET_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_PRESET = {
  id: VALID_PRESET_ID,
  userId: MOCK_USER_ID,
  name: "Social Campaign",
  source: "facebook",
  medium: "social",
  campaign: "summer_sale",
  content: null,
  term: null,
  isDefault: false,
  createdAt: new Date(),
};

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/utm-presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/utm-presets/${id}`, {
    method: "DELETE",
  });
}

function makePatchRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/utm-presets/${id}/set-default`, {
    method: "PATCH",
  });
}

// ── GET /api/utm-presets ──────────────────────────────────────────────────────

describe("GET /api/utm-presets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listPresets();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listPresets();
    expect(res.status).toBe(429);
  });

  it("returns empty presets array when none exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await listPresets();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { presets: unknown[] };
    expect(Array.isArray(data.presets)).toBe(true);
    expect(data.presets).toHaveLength(0);
  });

  it("returns list of presets with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_PRESET]);

    const res = await listPresets();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { presets: typeof BASE_PRESET[] };
    expect(data.presets).toHaveLength(1);
    expect(data.presets[0].source).toBe("facebook");
    expect(data.presets[0].medium).toBe("social");
  });
});

// ── POST /api/utm-presets ─────────────────────────────────────────────────────

describe("POST /api/utm-presets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createPreset(
      makePostRequest({ name: "Test", source: "fb", medium: "social" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createPreset(
      makePostRequest({ name: "Test", source: "fb", medium: "social" })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 when required fields are missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createPreset(makePostRequest({ name: "Test" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 422 when max preset limit reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(20);

    const res = await createPreset(
      makePostRequest({ name: "One More", source: "fb", medium: "social" })
    );
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Maximum/);
  });

  it("creates preset and returns 201 with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_PRESET);

    const res = await createPreset(
      makePostRequest({ name: "Social Campaign", source: "facebook", medium: "social", campaign: "summer_sale" })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_PRESET;
    expect(data.source).toBe("facebook");
    expect(data.campaign).toBe("summer_sale");
  });
});

// ── DELETE /api/utm-presets/[id] ──────────────────────────────────────────────

describe("DELETE /api/utm-presets/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deletePreset(makeDeleteRequest(VALID_PRESET_ID), {
      params: Promise.resolve({ id: VALID_PRESET_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deletePreset(makeDeleteRequest(VALID_PRESET_ID), {
      params: Promise.resolve({ id: VALID_PRESET_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for short/invalid ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await deletePreset(makeDeleteRequest("bad"), {
      params: Promise.resolve({ id: "bad" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when preset belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PRESET, userId: OTHER_USER_ID });
    const res = await deletePreset(makeDeleteRequest(VALID_PRESET_ID), {
      params: Promise.resolve({ id: VALID_PRESET_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_PRESET);
    mockDelete.mockResolvedValueOnce(BASE_PRESET);

    const res = await deletePreset(makeDeleteRequest(VALID_PRESET_ID), {
      params: Promise.resolve({ id: VALID_PRESET_ID }),
    });
    expect(res.status).toBe(204);
  });
});

// ── PATCH /api/utm-presets/[id]/set-default ───────────────────────────────────

describe("PATCH /api/utm-presets/[id]/set-default", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await setDefault(makePatchRequest(VALID_PRESET_ID), {
      params: Promise.resolve({ id: VALID_PRESET_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await setDefault(makePatchRequest(VALID_PRESET_ID), {
      params: Promise.resolve({ id: VALID_PRESET_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when preset not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await setDefault(makePatchRequest(VALID_PRESET_ID), {
      params: Promise.resolve({ id: VALID_PRESET_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when preset belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PRESET, userId: OTHER_USER_ID });
    const res = await setDefault(makePatchRequest(VALID_PRESET_ID), {
      params: Promise.resolve({ id: VALID_PRESET_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("sets preset as default and returns updated preset", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique
      .mockResolvedValueOnce(BASE_PRESET)
      .mockResolvedValueOnce({ ...BASE_PRESET, isDefault: true });
    mockTransaction.mockResolvedValueOnce([null, { ...BASE_PRESET, isDefault: true }]);

    const res = await setDefault(makePatchRequest(VALID_PRESET_ID), {
      params: Promise.resolve({ id: VALID_PRESET_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isDefault: boolean };
    expect(data.isDefault).toBe(true);
  });
});
