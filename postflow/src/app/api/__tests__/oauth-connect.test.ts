jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  oauthLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  oauthLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({
    "X-RateLimit-Limit": "20",
    "X-RateLimit-Remaining": "0",
  }),
}));

jest.mock("@/lib/auth/meta-oauth", () => ({
  buildOAuthUrl: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/oauth/meta/connect/route";
import { auth } from "@/auth";
import { oauthLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { buildOAuthUrl } from "@/lib/auth/meta-oauth";

const mockAuth = auth as jest.Mock;
const mockOauthLimiter = oauthLimiter as jest.Mock;
const mockRateLimitHeaders = rateLimitHeaders as jest.Mock;
const mockBuildOAuthUrl = buildOAuthUrl as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 20, remaining: 19, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 20, remaining: 0, resetAt: new Date() };
const MOCK_OAUTH_URL =
  "https://www.facebook.com/v21.0/dialog/oauth?client_id=test_app_id&state=placeholder";

function makeGetRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/oauth/meta/connect", {
    method: "GET",
    headers,
  });
}

describe("GET /api/oauth/meta/connect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildOAuthUrl.mockReturnValue(MOCK_OAUTH_URL);
    mockOauthLimiter.mockResolvedValue(RATE_LIMIT_OK);
  });

  describe("authentication", () => {
    it("returns 401 when session is null", async () => {
      mockAuth.mockResolvedValue(null);
      const res = await GET(makeGetRequest());
      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when session exists but has no user id", async () => {
      mockAuth.mockResolvedValue({ user: { email: "no-id@example.com" } });
      const res = await GET(makeGetRequest());
      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when session user is undefined", async () => {
      mockAuth.mockResolvedValue({ user: undefined });
      const res = await GET(makeGetRequest());
      expect(res.status).toBe(401);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      mockOauthLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
      const res = await GET(makeGetRequest({ "x-forwarded-for": "1.2.3.4" }));
      expect(res.status).toBe(429);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Too many requests");
    });

    it("attaches rate-limit headers on 429 response", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      mockOauthLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
      mockRateLimitHeaders.mockReturnValue({ "X-RateLimit-Remaining": "0" });
      const res = await GET(makeGetRequest());
      expect(mockRateLimitHeaders).toHaveBeenCalledWith(RATE_LIMIT_EXCEEDED);
    });

    it("extracts first IP from x-forwarded-for for rate limiting", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      await GET(makeGetRequest({ "x-forwarded-for": "10.0.0.1, 192.168.1.1" }));
      expect(mockOauthLimiter).toHaveBeenCalledWith("10.0.0.1");
    });

    it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      await GET(makeGetRequest({ "x-real-ip": "5.6.7.8" }));
      expect(mockOauthLimiter).toHaveBeenCalledWith("5.6.7.8");
    });

    it('falls back to "unknown" when no IP headers are present', async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      await GET(makeGetRequest());
      expect(mockOauthLimiter).toHaveBeenCalledWith("unknown");
    });
  });

  describe("state generation and redirect", () => {
    it("redirects to the URL returned by buildOAuthUrl", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      const res = await GET(makeGetRequest());
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get("location")).toBe(MOCK_OAUTH_URL);
    });

    it("passes a 64-character hex state string to buildOAuthUrl", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      await GET(makeGetRequest());
      expect(mockBuildOAuthUrl).toHaveBeenCalledTimes(1);
      const [state] = mockBuildOAuthUrl.mock.calls[0] as [string];
      expect(state).toMatch(/^[0-9a-f]{64}$/);
    });

    it("generates a different state on each request", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      await GET(makeGetRequest());
      await GET(makeGetRequest());
      const [call1] = mockBuildOAuthUrl.mock.calls[0] as [string];
      const [call2] = mockBuildOAuthUrl.mock.calls[1] as [string];
      expect(call1).not.toBe(call2);
    });

    it("sets meta_oauth_state cookie in the response", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      const res = await GET(makeGetRequest());
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("meta_oauth_state=");
    });

    it("sets cookie with HttpOnly attribute", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      const res = await GET(makeGetRequest());
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie.toLowerCase()).toContain("httponly");
    });

    it("sets cookie with SameSite=Lax attribute", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      const res = await GET(makeGetRequest());
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie.toLowerCase()).toContain("samesite=lax");
    });

    it("sets cookie with Max-Age=600", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      const res = await GET(makeGetRequest());
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie.toLowerCase()).toContain("max-age=600");
    });

    it("sets cookie with Path=/", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      const res = await GET(makeGetRequest());
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie.toLowerCase()).toContain("path=/");
    });

    it("cookie state value matches the state passed to buildOAuthUrl", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      const res = await GET(makeGetRequest());
      const [state] = mockBuildOAuthUrl.mock.calls[0] as [string];
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain(`meta_oauth_state=${state}`);
    });

    it("does not set Secure attribute in non-production environment", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      const originalEnv = process.env.NODE_ENV;
      // NODE_ENV is "test" during jest runs — Secure should NOT be set
      const res = await GET(makeGetRequest());
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie.toLowerCase()).not.toContain("secure");
      // restore (read-only in strict mode — just for documentation)
      void originalEnv;
    });
  });

  describe("error handling", () => {
    it("redirects to /accounts?error=config_error when buildOAuthUrl throws", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      mockBuildOAuthUrl.mockImplementation(() => {
        throw new Error("Missing META_APP_ID");
      });
      const res = await GET(makeGetRequest());
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/accounts");
      expect(location).toContain("error=config_error");
    });

    it("redirects to /accounts?error=config_error when oauthLimiter throws", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      mockOauthLimiter.mockRejectedValue(new Error("Redis connection failed"));
      const res = await GET(makeGetRequest());
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("error=config_error");
    });

    it("does not expose error details in redirect on failure", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION);
      mockBuildOAuthUrl.mockImplementation(() => {
        throw new Error("Internal secret leaked");
      });
      const res = await GET(makeGetRequest());
      const location = res.headers.get("location") ?? "";
      expect(location).not.toContain("Internal secret leaked");
    });
  });
});
