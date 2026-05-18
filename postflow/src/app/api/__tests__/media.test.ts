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
    mediaAsset: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("@/lib/platforms/media", () => ({
  uploadMedia: jest.fn(),
  deleteMedia: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/media/route";
import { DELETE, PATCH } from "@/app/api/media/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { uploadMedia, deleteMedia } from "@/lib/platforms/media";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.mediaAsset.findMany as jest.Mock;
const mockCount = prisma.mediaAsset.count as jest.Mock;
const mockCreate = prisma.mediaAsset.create as jest.Mock;
const mockFindUnique = prisma.mediaAsset.findUnique as jest.Mock;
const mockUpdate = prisma.mediaAsset.update as jest.Mock;
const mockDelete = prisma.mediaAsset.delete as jest.Mock;
const mockUploadMedia = uploadMedia as jest.Mock;
const mockDeleteMedia = deleteMedia as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_ASSET_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const MOCK_ASSET = {
  id: VALID_ASSET_ID,
  userId: MOCK_USER_ID,
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  size: 102400,
  r2Key: "media/abc123.jpg",
  publicUrl: "https://cdn.example.com/media/abc123.jpg",
  description: null,
  tags: [] as string[],
  createdAt: new Date("2026-04-22T10:00:00Z"),
};

function makeGetRequest(params = ""): NextRequest {
  return new NextRequest(`http://localhost:3000/api/media${params}`);
}

function makeDeleteRequest(id = VALID_ASSET_ID): NextRequest {
  return new NextRequest(`http://localhost:3000/api/media/${id}`, { method: "DELETE" });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── GET /api/media ─────────────────────────────────────────────────────────────

describe("GET /api/media", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValue([MOCK_ASSET]);
    mockCount.mockResolvedValue(1);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid query params", async () => {
    const res = await GET(makeGetRequest("?page=abc"));
    expect(res.status).toBe(400);
  });

  it("returns paginated asset list", async () => {
    const res = await GET(makeGetRequest("?page=1&limit=10"));
    expect(res.status).toBe(200);
    const body = await res.json() as { assets: unknown[]; pagination: { total: number } };
    expect(body.assets).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it("queries only assets belonging to the current user", async () => {
    await GET(makeGetRequest());
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });

  it("returns empty list when user has no assets", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { assets: unknown[]; pagination: { total: number } };
    expect(body.assets).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });
});

// ── POST /api/media ────────────────────────────────────────────────────────────

describe("POST /api/media", () => {
  function makeUploadRequest(mimeType = "image/jpeg", size = 1024, filename = "photo.jpg"): NextRequest {
    const file = new File(["x".repeat(size)], filename, { type: mimeType });
    const formData = new FormData();
    formData.append("file", file);
    return new NextRequest("http://localhost:3000/api/media", {
      method: "POST",
      body: formData,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockUploadMedia.mockResolvedValue({
      key: "media/abc123.jpg",
      publicUrl: "https://cdn.example.com/media/abc123.jpg",
    });
    mockCreate.mockResolvedValue(MOCK_ASSET);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeUploadRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeUploadRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 when no file is provided", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost:3000/api/media", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/no file/i);
  });

  it("returns 400 for disallowed MIME type", async () => {
    const res = await POST(makeUploadRequest("application/pdf"));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/unsupported file type/i);
  });

  it("uploads file and returns 201 with asset record", async () => {
    const res = await POST(makeUploadRequest("image/png", 512, "banner.png"));
    expect(res.status).toBe(201);
    expect(mockUploadMedia).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: MOCK_USER_ID }) })
    );
  });

  it("accepts allowed video MIME type", async () => {
    const res = await POST(makeUploadRequest("video/mp4", 512, "clip.mp4"));
    expect(res.status).toBe(201);
  });
});

// ── DELETE /api/media/[id] ─────────────────────────────────────────────────────

describe("DELETE /api/media/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockFindUnique.mockResolvedValue(MOCK_ASSET);
    mockDelete.mockResolvedValue(MOCK_ASSET);
    mockDeleteMedia.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid CUID", async () => {
    const res = await DELETE(makeDeleteRequest("not-a-cuid"), makeParams("not-a-cuid"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when asset does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when asset belongs to another user", async () => {
    mockFindUnique.mockResolvedValue({ ...MOCK_ASSET, userId: OTHER_USER_ID });
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(404);
  });

  it("deletes from R2 and DB and returns 204", async () => {
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(204);
    expect(mockDeleteMedia).toHaveBeenCalledWith(MOCK_ASSET.r2Key);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: VALID_ASSET_ID } });
  });

  it("still deletes DB record even when R2 deletion throws", async () => {
    mockDeleteMedia.mockRejectedValue(new Error("R2 error"));
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalled();
  });
});

// ── PATCH /api/media/[id] ──────────────────────────────────────────────────────

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/media/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/media/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValue(MOCK_ASSET);
    mockUpdate.mockResolvedValue({ ...MOCK_ASSET, description: "Updated", tags: ["nature"] });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makePatchRequest(VALID_ASSET_ID, { description: "test" }), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await PATCH(makePatchRequest(VALID_ASSET_ID, {}), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(429);
  });

  it("returns 404 for invalid CUID", async () => {
    const res = await PATCH(makePatchRequest("bad-id", {}), makeParams("bad-id"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when asset belongs to another user", async () => {
    mockFindUnique.mockResolvedValue({ ...MOCK_ASSET, userId: OTHER_USER_ID });
    const res = await PATCH(makePatchRequest(VALID_ASSET_ID, {}), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    const res = await PATCH(makePatchRequest(VALID_ASSET_ID, { tags: "not-an-array" }), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(400);
  });

  it("updates description and returns updated asset", async () => {
    const res = await PATCH(makePatchRequest(VALID_ASSET_ID, { description: "Updated" }), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { description: string };
    expect(body.description).toBe("Updated");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: "Updated" }) })
    );
  });

  it("updates tags and returns updated asset", async () => {
    const res = await PATCH(makePatchRequest(VALID_ASSET_ID, { tags: ["nature", "landscape"] }), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tags: ["nature", "landscape"] }) })
    );
  });
});

// ── GET /api/media with search + tag filters ───────────────────────────────────

describe("GET /api/media — search and tag filters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValue([MOCK_ASSET]);
    mockCount.mockResolvedValue(1);
  });

  it("passes search param to prisma where clause", async () => {
    const res = await GET(makeGetRequest("?search=banner"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ filename: expect.objectContaining({ contains: "banner" }) }),
          ]),
        }),
      })
    );
  });

  it("passes tag param to prisma where clause", async () => {
    const res = await GET(makeGetRequest("?tag=nature"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tags: { has: "nature" },
        }),
      })
    );
  });

  it("returns results without filters when no params", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });
});
