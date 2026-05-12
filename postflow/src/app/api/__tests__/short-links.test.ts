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
    shortLink: {
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
import { GET as listLinks, POST as createLink } from "@/app/api/short-links/route";
import { DELETE as deleteLink } from "@/app/api/short-links/[id]/route";
import { GET as publicRedirect } from "@/app/s/[slug]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.shortLink.findMany as jest.Mock;
const mockFindUnique = prisma.shortLink.findUnique as jest.Mock;
const mockCreate = prisma.shortLink.create as jest.Mock;
const mockCount = prisma.shortLink.count as jest.Mock;
const mockDelete = prisma.shortLink.delete as jest.Mock;
const mockUpdate = prisma.shortLink.update as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const LINK_ID = "clh3ck8zp0001qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_LINK = {
  id: LINK_ID,
  userId: MOCK_USER_ID,
  originalUrl: "https://example.com/very-long-url-path",
  slug: "abc123",
  title: "Example Link",
  clicks: 5,
  expiresAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
});

// ── GET /api/short-links ──────────────────────────────────────────────────────

describe("GET /api/short-links", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listLinks();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await listLinks();
    expect(res.status).toBe(429);
  });

  it("returns list of short links", async () => {
    mockFindMany.mockResolvedValue([BASE_LINK]);
    const res = await listLinks();
    expect(res.status).toBe(200);
    const body = await res.json() as { links: typeof BASE_LINK[] };
    expect(body.links).toHaveLength(1);
    expect(body.links[0].slug).toBe("abc123");
    expect(body.links[0].clicks).toBe(5);
  });

  it("returns empty array when no links", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await listLinks();
    expect(res.status).toBe(200);
    const body = await res.json() as { links: unknown[] };
    expect(body.links).toHaveLength(0);
  });
});

// ── POST /api/short-links — auto slug ────────────────────────────────────────

describe("POST /api/short-links — auto slug", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/short-links", {
      method: "POST",
      body: JSON.stringify({ originalUrl: "https://example.com" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const req = makeRequest("http://localhost/api/short-links", {
      method: "POST",
      body: JSON.stringify({ originalUrl: "https://example.com" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid URL", async () => {
    const req = makeRequest("http://localhost/api/short-links", {
      method: "POST",
      body: JSON.stringify({ originalUrl: "not-a-url" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(400);
  });

  it("creates short link with auto-generated slug", async () => {
    mockCount.mockResolvedValue(0);
    mockFindUnique.mockResolvedValue(null); // no slug collision
    const createdLink = { ...BASE_LINK, slug: "xy7abc", originalUrl: "https://example.com/path" };
    mockCreate.mockResolvedValue(createdLink);

    const req = makeRequest("http://localhost/api/short-links", {
      method: "POST",
      body: JSON.stringify({ originalUrl: "https://example.com/path" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(201);
    const body = await res.json() as { link: typeof BASE_LINK };
    expect(body.link.originalUrl).toBe("https://example.com/path");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 422 when max links reached", async () => {
    mockCount.mockResolvedValue(200);
    const req = makeRequest("http://localhost/api/short-links", {
      method: "POST",
      body: JSON.stringify({ originalUrl: "https://example.com" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(422);
  });
});

// ── POST /api/short-links — custom slug ──────────────────────────────────────

describe("POST /api/short-links — custom slug", () => {
  it("creates short link with custom slug when available", async () => {
    mockCount.mockResolvedValue(0);
    mockFindUnique.mockResolvedValue(null); // custom slug is free
    mockCreate.mockResolvedValue({ ...BASE_LINK, slug: "my-link" });

    const req = makeRequest("http://localhost/api/short-links", {
      method: "POST",
      body: JSON.stringify({ originalUrl: "https://example.com", slug: "my-link" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(201);
  });

  it("returns 409 when custom slug is taken", async () => {
    mockCount.mockResolvedValue(0);
    mockFindUnique.mockResolvedValue(BASE_LINK); // slug already exists

    const req = makeRequest("http://localhost/api/short-links", {
      method: "POST",
      body: JSON.stringify({ originalUrl: "https://example.com", slug: "abc123" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createLink(req);
    expect(res.status).toBe(409);
  });
});

// ── DELETE /api/short-links/[id] ──────────────────────────────────────────────

describe("DELETE /api/short-links/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/short-links/abc", { method: "DELETE" });
    const res = await deleteLink(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when link does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/short-links/nope", { method: "DELETE" });
    const res = await deleteLink(req, { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when link belongs to another user", async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_LINK, userId: OTHER_USER_ID });
    const req = makeRequest("http://localhost/api/short-links/abc", { method: "DELETE" });
    const res = await deleteLink(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(403);
  });

  it("deletes link and returns success", async () => {
    mockFindUnique.mockResolvedValue(BASE_LINK);
    mockDelete.mockResolvedValue(BASE_LINK);
    const req = makeRequest("http://localhost/api/short-links/abc", { method: "DELETE" });
    const res = await deleteLink(req, { params: Promise.resolve({ id: LINK_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });
});

// ── GET /s/[slug] — public redirect ──────────────────────────────────────────

describe("GET /s/[slug] — public redirect", () => {
  it("returns 404 for unknown slug", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = makeRequest("http://localhost/s/unknown");
    const res = await publicRedirect(req, { params: Promise.resolve({ slug: "unknown" }) });
    expect(res.status).toBe(404);
  });

  it("returns 410 for expired link", async () => {
    mockFindUnique.mockResolvedValue({
      ...BASE_LINK,
      expiresAt: new Date("2020-01-01T00:00:00Z"),
    });
    const req = makeRequest("http://localhost/s/abc123");
    const res = await publicRedirect(req, { params: Promise.resolve({ slug: "abc123" }) });
    expect(res.status).toBe(410);
  });

  it("redirects to originalUrl for valid slug", async () => {
    mockFindUnique.mockResolvedValue(BASE_LINK);
    mockUpdate.mockResolvedValue({ ...BASE_LINK, clicks: 6 });
    const req = makeRequest("http://localhost/s/abc123");
    const res = await publicRedirect(req, { params: Promise.resolve({ slug: "abc123" }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(BASE_LINK.originalUrl);
  });

  it("redirects even for future expiry", async () => {
    mockFindUnique.mockResolvedValue({
      ...BASE_LINK,
      expiresAt: new Date("2099-01-01T00:00:00Z"),
    });
    mockUpdate.mockResolvedValue({ ...BASE_LINK, clicks: 1 });
    const req = makeRequest("http://localhost/s/abc123");
    const res = await publicRedirect(req, { params: Promise.resolve({ slug: "abc123" }) });
    expect(res.status).toBe(302);
  });
});
