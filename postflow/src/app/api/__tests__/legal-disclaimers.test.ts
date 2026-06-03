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
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
    LINKEDIN: "LINKEDIN",
    PINTEREST: "PINTEREST",
    YOUTUBE: "YOUTUBE",
    TIKTOK: "TIKTOK",
    TWITTER: "TWITTER",
    BLUESKY: "BLUESKY",
    MASTODON: "MASTODON",
    TELEGRAM: "TELEGRAM",
    REDDIT: "REDDIT",
    NOSTR: "NOSTR",
    TUMBLR: "TUMBLR",
    WORDPRESS: "WORDPRESS",
    MEDIUM: "MEDIUM",
    GHOST: "GHOST",
    DEVTO: "DEVTO",
    GOOGLE_BUSINESS: "GOOGLE_BUSINESS",
    HASHNODE: "HASHNODE",
    BEEHIIV: "BEEHIIV",
    PIXELFED: "PIXELFED",
    VIMEO: "VIMEO",
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    legalDisclaimer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listDisclaimers, POST as createDisclaimer } from "@/app/api/legal-disclaimers/route";
import { PATCH as updateDisclaimer, DELETE as deleteDisclaimer } from "@/app/api/legal-disclaimers/[id]/route";
import { POST as previewDisclaimer } from "@/app/api/legal-disclaimers/preview/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.legalDisclaimer.findMany as jest.Mock;
const mockFindUnique = prisma.legalDisclaimer.findUnique as jest.Mock;
const mockCount = prisma.legalDisclaimer.count as jest.Mock;
const mockCreate = prisma.legalDisclaimer.create as jest.Mock;
const mockUpdate = prisma.legalDisclaimer.update as jest.Mock;
const mockDelete = prisma.legalDisclaimer.delete as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_DISCLAIMER = {
  id: VALID_ID,
  userId: MOCK_USER_ID,
  name: "Standard legal footer",
  content: "This post is for informational purposes only.",
  platforms: [],
  position: "append",
  autoAppend: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── GET /api/legal-disclaimers ────────────────────────────────────────────────

describe("GET /api/legal-disclaimers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listDisclaimers();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listDisclaimers();
    expect(res.status).toBe(429);
  });

  it("returns list of disclaimers for authenticated user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([BASE_DISCLAIMER]);

    const res = await listDisclaimers();
    expect(res.status).toBe(200);
    const data = await res.json() as { disclaimers: typeof BASE_DISCLAIMER[] };
    expect(data.disclaimers).toHaveLength(1);
    expect(data.disclaimers[0].name).toBe("Standard legal footer");
  });

  it("returns empty array when user has no disclaimers", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await listDisclaimers();
    expect(res.status).toBe(200);
    const data = await res.json() as { disclaimers: unknown[] };
    expect(data.disclaimers).toHaveLength(0);
  });
});

// ── POST /api/legal-disclaimers ───────────────────────────────────────────────

describe("POST /api/legal-disclaimers", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/legal-disclaimers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createDisclaimer(
      makeRequest({ name: "Test", content: "Disclaimer text" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createDisclaimer(
      makeRequest({ name: "Test", content: "Disclaimer text" })
    );
    expect(res.status).toBe(429);
  });

  it("returns 422 when max disclaimers limit (20) is reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(20);

    const res = await createDisclaimer(
      makeRequest({ name: "Test", content: "Disclaimer text" })
    );
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);

    const req = new NextRequest("http://localhost:3000/api/legal-disclaimers", {
      method: "POST",
      body: "not-json",
    });
    const res = await createDisclaimer(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);

    const res = await createDisclaimer(makeRequest({ content: "Disclaimer text" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);

    const res = await createDisclaimer(makeRequest({ name: "Test Disclaimer" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 with created disclaimer", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_DISCLAIMER);

    const res = await createDisclaimer(
      makeRequest({ name: "Standard legal footer", content: "This post is for informational purposes only." })
    );
    expect(res.status).toBe(201);
    const data = await res.json() as { disclaimer: typeof BASE_DISCLAIMER };
    expect(data.disclaimer.name).toBe("Standard legal footer");
    expect(data.disclaimer.position).toBe("append");
  });

  it("creates disclaimer with the authenticated user ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_DISCLAIMER);

    await createDisclaimer(
      makeRequest({ name: "Test", content: "Legal text here" })
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: MOCK_USER_ID }),
      })
    );
  });
});

// ── PATCH /api/legal-disclaimers/[id] ────────────────────────────────────────

describe("PATCH /api/legal-disclaimers/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id: string, body: unknown) {
    return new NextRequest(`http://localhost:3000/api/legal-disclaimers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateDisclaimer(
      makeRequest(VALID_ID, { isActive: false }),
      makeParams(VALID_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await updateDisclaimer(
      makeRequest(VALID_ID, { isActive: false }),
      makeParams(VALID_ID)
    );
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await updateDisclaimer(
      makeRequest("bad-id", { isActive: false }),
      makeParams("bad-id")
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when disclaimer does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await updateDisclaimer(
      makeRequest(VALID_ID, { isActive: false }),
      makeParams(VALID_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when disclaimer belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_DISCLAIMER, userId: OTHER_USER_ID });
    const res = await updateDisclaimer(
      makeRequest(VALID_ID, { isActive: false }),
      makeParams(VALID_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid position value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_DISCLAIMER);

    const res = await updateDisclaimer(
      makeRequest(VALID_ID, { position: "invalid" }),
      makeParams(VALID_ID)
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with updated disclaimer", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_DISCLAIMER);
    const updated = { ...BASE_DISCLAIMER, isActive: false };
    mockUpdate.mockResolvedValueOnce(updated);

    const res = await updateDisclaimer(
      makeRequest(VALID_ID, { isActive: false }),
      makeParams(VALID_ID)
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { disclaimer: typeof updated };
    expect(data.disclaimer.isActive).toBe(false);
  });
});

// ── DELETE /api/legal-disclaimers/[id] ───────────────────────────────────────

describe("DELETE /api/legal-disclaimers/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(id: string) {
    return new NextRequest(`http://localhost:3000/api/legal-disclaimers/${id}`, {
      method: "DELETE",
    });
  }
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteDisclaimer(makeRequest(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteDisclaimer(makeRequest(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await deleteDisclaimer(makeRequest("bad-id"), makeParams("bad-id"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when disclaimer does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await deleteDisclaimer(makeRequest(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when disclaimer belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_DISCLAIMER, userId: OTHER_USER_ID });
    const res = await deleteDisclaimer(makeRequest(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_DISCLAIMER);
    mockDelete.mockResolvedValueOnce(BASE_DISCLAIMER);

    const res = await deleteDisclaimer(makeRequest(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: VALID_ID } });
  });
});

// ── POST /api/legal-disclaimers/preview ──────────────────────────────────────

describe("POST /api/legal-disclaimers/preview", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/legal-disclaimers/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await previewDisclaimer(
      makeRequest({ content: "My post content", disclaimerId: VALID_ID })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await previewDisclaimer(
      makeRequest({ content: "My post content", disclaimerId: VALID_ID })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 when content is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await previewDisclaimer(
      makeRequest({ disclaimerId: VALID_ID })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when disclaimerId is invalid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await previewDisclaimer(
      makeRequest({ content: "My post content", disclaimerId: "bad-id" })
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when disclaimer does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await previewDisclaimer(
      makeRequest({ content: "My post content", disclaimerId: VALID_ID })
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when disclaimer belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_DISCLAIMER, userId: OTHER_USER_ID });
    const res = await previewDisclaimer(
      makeRequest({ content: "My post content", disclaimerId: VALID_ID })
    );
    expect(res.status).toBe(404);
  });

  it("returns preview with disclaimer appended when position is append", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_DISCLAIMER, position: "append" });

    const res = await previewDisclaimer(
      makeRequest({ content: "My post content", disclaimerId: VALID_ID })
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { preview: string };
    expect(data.preview).toBe(
      `My post content\n\n${BASE_DISCLAIMER.content}`
    );
  });

  it("returns preview with disclaimer prepended when position is prepend", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_DISCLAIMER, position: "prepend" });

    const res = await previewDisclaimer(
      makeRequest({ content: "My post content", disclaimerId: VALID_ID })
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { preview: string };
    expect(data.preview).toBe(
      `${BASE_DISCLAIMER.content}\n\nMy post content`
    );
  });
});
