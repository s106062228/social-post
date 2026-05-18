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
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ai", () => ({
  generateMediaTags: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/media/[id]/tags/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { generateMediaTags } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindUnique = prisma.mediaAsset.findUnique as jest.Mock;
const mockUpdate = prisma.mediaAsset.update as jest.Mock;
const mockGenerateMediaTags = generateMediaTags as jest.Mock;

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

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeRequest(id = VALID_ASSET_ID): NextRequest {
  return new NextRequest(`http://localhost:3000/api/media/${id}/tags`, { method: "POST" });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/media/[id]/tags", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValue(MOCK_ASSET);
    mockUpdate.mockResolvedValue({ ...MOCK_ASSET, tags: ["nature", "outdoors", "green"] });
    mockGenerateMediaTags.mockResolvedValue(["nature", "outdoors", "green"]);
  });

  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await POST(makeRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("not configured");
  });

  it("returns 404 for invalid CUID", async () => {
    const res = await POST(makeRequest("not-a-cuid"), makeParams("not-a-cuid"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when asset does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when asset belongs to another user", async () => {
    mockFindUnique.mockResolvedValue({ ...MOCK_ASSET, userId: OTHER_USER_ID });
    const res = await POST(makeRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(404);
  });

  it("generates tags and returns them on success", async () => {
    const res = await POST(makeRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tags: string[] };
    expect(body.tags).toEqual(["nature", "outdoors", "green"]);
    expect(mockGenerateMediaTags).toHaveBeenCalledWith(MOCK_ASSET.publicUrl);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: ["nature", "outdoors", "green"] } })
    );
  });

  it("returns 500 on AI generation error", async () => {
    mockGenerateMediaTags.mockRejectedValue(new Error("Vision API error"));
    const res = await POST(makeRequest(), makeParams(VALID_ASSET_ID));
    expect(res.status).toBe(500);
  });
});
