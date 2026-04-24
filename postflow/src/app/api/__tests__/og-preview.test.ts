jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/og-preview", () => ({
  fetchOgMetadata: jest.fn(),
  extractFirstUrl: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/og-preview/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { fetchOgMetadata } from "@/lib/og-preview";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFetchOg = fetchOgMetadata as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const SAMPLE_METADATA = {
  url: "https://example.com/article",
  title: "Example Article",
  description: "An example article for testing.",
  image: "https://example.com/og.png",
};

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

describe("GET /api/og-preview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = makeRequest("http://localhost:3000/api/og-preview?url=https://example.com");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const req = makeRequest("http://localhost:3000/api/og-preview?url=https://example.com");
    const res = await GET(req);
    expect(res.status).toBe(429);
  });

  it("returns 400 when url param is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = makeRequest("http://localhost:3000/api/og-preview");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/missing/i);
  });

  it("returns 400 for a malformed URL", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = makeRequest("http://localhost:3000/api/og-preview?url=not-a-url");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid url/i);
  });

  it("returns 400 for non-http scheme (ftp)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = makeRequest(
      "http://localhost:3000/api/og-preview?url=" + encodeURIComponent("ftp://example.com/file")
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/http/i);
  });

  it("returns 400 for localhost URLs (SSRF protection)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = makeRequest(
      "http://localhost:3000/api/og-preview?url=" + encodeURIComponent("http://localhost:8080/internal")
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not allowed/i);
  });

  it("returns 400 for private IP addresses (SSRF protection)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = makeRequest(
      "http://localhost:3000/api/og-preview?url=" + encodeURIComponent("http://192.168.1.1/admin")
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not allowed/i);
  });

  it("returns OG metadata on a successful fetch", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFetchOg.mockResolvedValueOnce(SAMPLE_METADATA);

    const req = makeRequest(
      "http://localhost:3000/api/og-preview?url=" + encodeURIComponent("https://example.com/article")
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json() as typeof SAMPLE_METADATA;
    expect(body.title).toBe("Example Article");
    expect(body.description).toBe("An example article for testing.");
    expect(body.image).toBe("https://example.com/og.png");
    expect(mockFetchOg).toHaveBeenCalledWith("https://example.com/article");
  });

  it("returns empty metadata object when page has no OG tags", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFetchOg.mockResolvedValueOnce({
      url: "https://example.com/plain",
      title: "",
      description: "",
      image: "",
    });

    const req = makeRequest(
      "http://localhost:3000/api/og-preview?url=" + encodeURIComponent("https://example.com/plain")
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { title: string; description: string; image: string };
    expect(body.title).toBe("");
    expect(body.description).toBe("");
    expect(body.image).toBe("");
  });

  it("handles errors from fetchOgMetadata gracefully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFetchOg.mockRejectedValueOnce(new Error("network error"));

    const req = makeRequest(
      "http://localhost:3000/api/og-preview?url=" + encodeURIComponent("https://example.com")
    );
    const res = await GET(req);
    // handleRouteError returns 500 for unexpected errors
    expect(res.status).toBe(500);
  });
});
