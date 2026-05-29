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
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
  Platform: {
    FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS", LINKEDIN: "LINKEDIN",
    PINTEREST: "PINTEREST", YOUTUBE: "YOUTUBE", TIKTOK: "TIKTOK", TWITTER: "TWITTER",
    BLUESKY: "BLUESKY", MASTODON: "MASTODON", TELEGRAM: "TELEGRAM", REDDIT: "REDDIT",
    NOSTR: "NOSTR", TUMBLR: "TUMBLR", WORDPRESS: "WORDPRESS", MEDIUM: "MEDIUM",
    GHOST: "GHOST", DEVTO: "DEVTO", GOOGLE_BUSINESS: "GOOGLE_BUSINESS",
    HASHNODE: "HASHNODE", BEEHIIV: "BEEHIIV", PIXELFED: "PIXELFED", VIMEO: "VIMEO",
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/validate/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/posts/validate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/posts/validate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ content: "Hello", platforms: ["FACEBOOK"], mediaType: "NONE", mediaUrls: [] }));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });
    const res = await POST(makeRequest({ content: "Hello", platforms: ["FACEBOOK"], mediaType: "NONE", mediaUrls: [] }));
    expect(res.status).toBe(429);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest({ platforms: "not-an-array" }));
    expect(res.status).toBe(400);
  });

  it("returns overallValid:true and empty results for empty platforms array", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest({ content: "Hello", platforms: [], mediaType: "NONE", mediaUrls: [] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: unknown[]; overallValid: boolean };
    expect(data.overallValid).toBe(true);
    expect(data.results).toHaveLength(0);
  });

  // ── Valid post ────────────────────────────────────────────────────────────

  it("returns overallValid:true for a valid Facebook text post", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest({
      content: "Hello world!",
      platforms: ["FACEBOOK"],
      mediaType: "NONE",
      mediaUrls: [],
    }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { platform: string; valid: boolean; errors: string[]; warnings: string[] }[]; overallValid: boolean };
    expect(data.overallValid).toBe(true);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].valid).toBe(true);
    expect(data.results[0].errors).toHaveLength(0);
  });

  // ── Character limit error ─────────────────────────────────────────────────

  it("returns error when content exceeds Twitter char limit", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const longContent = "a".repeat(300); // Twitter limit is 280
    const res = await POST(makeRequest({
      content: longContent,
      platforms: ["TWITTER"],
      mediaType: "NONE",
      mediaUrls: [],
    }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { platform: string; valid: boolean; errors: string[] }[]; overallValid: boolean };
    expect(data.overallValid).toBe(false);
    expect(data.results[0].valid).toBe(false);
    expect(data.results[0].errors.some((e) => e.includes("character limit"))).toBe(true);
  });

  // ── Media type error ──────────────────────────────────────────────────────

  it("returns error when IMAGE post is attempted on YOUTUBE", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest({
      content: "Watch my video!",
      platforms: ["YOUTUBE"],
      mediaType: "IMAGE",
      mediaUrls: ["https://example.com/img.jpg"],
    }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { platform: string; valid: boolean; errors: string[] }[]; overallValid: boolean };
    expect(data.overallValid).toBe(false);
    expect(data.results[0].errors.some((e) => e.includes("does not support IMAGE"))).toBe(true);
  });

  // ── Hashtag warning ───────────────────────────────────────────────────────

  it("returns hashtag count warning for Threads with too many hashtags", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const manyHashtags = Array.from({ length: 15 }, (_, i) => `#tag${i}`).join(" ");
    const res = await POST(makeRequest({
      content: `Hello ${manyHashtags}`,
      platforms: ["THREADS"],
      mediaType: "NONE",
      mediaUrls: [],
    }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { warnings: string[]; valid: boolean }[]; overallValid: boolean };
    expect(data.overallValid).toBe(true); // warnings don't make it invalid
    expect(data.results[0].warnings.some((w) => w.includes("hashtags"))).toBe(true);
  });

  // ── Media count error ─────────────────────────────────────────────────────

  it("returns error when too many media files for Twitter (max 4)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest({
      content: "Check these out!",
      platforms: ["TWITTER"],
      mediaType: "IMAGE",
      mediaUrls: [
        "https://example.com/1.jpg",
        "https://example.com/2.jpg",
        "https://example.com/3.jpg",
        "https://example.com/4.jpg",
        "https://example.com/5.jpg",
      ],
    }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { errors: string[]; valid: boolean }[]; overallValid: boolean };
    expect(data.overallValid).toBe(false);
    expect(data.results[0].errors.some((e) => e.includes("media"))).toBe(true);
  });

  // ── Instagram external links warning ──────────────────────────────────────

  it("warns about external links not being clickable on Instagram", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest({
      content: "Check out https://example.com for more info!",
      platforms: ["INSTAGRAM"],
      mediaType: "IMAGE",
      mediaUrls: ["https://example.com/img.jpg"],
    }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { warnings: string[] }[] };
    expect(data.results[0].warnings.some((w) => w.includes("not clickable"))).toBe(true);
  });

  // ── Multiple platforms ─────────────────────────────────────────────────────

  it("returns results for each platform in multi-platform post", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest({
      content: "Hello world!",
      platforms: ["FACEBOOK", "INSTAGRAM", "THREADS"],
      mediaType: "IMAGE",
      mediaUrls: ["https://example.com/img.jpg"],
    }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { platform: string }[] };
    expect(data.results).toHaveLength(3);
    expect(data.results.map((r) => r.platform)).toContain("FACEBOOK");
    expect(data.results.map((r) => r.platform)).toContain("INSTAGRAM");
    expect(data.results.map((r) => r.platform)).toContain("THREADS");
  });

  // ── Media required error ──────────────────────────────────────────────────

  it("returns error when no media provided for Pinterest (requires IMAGE)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await POST(makeRequest({
      content: "My pin",
      platforms: ["PINTEREST"],
      mediaType: "NONE",
      mediaUrls: [],
    }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: { errors: string[] }[]; overallValid: boolean };
    expect(data.overallValid).toBe(false);
    expect(data.results[0].errors.some((e) => e.includes("requires media"))).toBe(true);
  });
});
