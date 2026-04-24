jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  oauthLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  oauthLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/auth/meta-oauth", () => ({
  buildOAuthUrl: jest.fn(),
  exchangeCodeForShortLivedToken: jest.fn(),
  exchangeForLongLivedToken: jest.fn(),
  getUserPages: jest.fn(),
  getPageInstagramAccount: jest.fn(),
  getThreadsUser: jest.fn(),
  META_SCOPES: "pages_manage_posts,instagram_basic,threads_basic",
}));

jest.mock("@/lib/auth/token-manager", () => ({
  storeOrUpdateSocialAccount: jest.fn(),
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET as connectGET } from "@/app/api/oauth/meta/connect/route";
import { GET as callbackGET } from "@/app/api/oauth/meta/callback/route";
import { auth } from "@/auth";
import { oauthLimiter } from "@/lib/rate-limit";
import {
  buildOAuthUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getUserPages,
  getPageInstagramAccount,
  getThreadsUser,
} from "@/lib/auth/meta-oauth";
import { storeOrUpdateSocialAccount } from "@/lib/auth/token-manager";
import { cookies } from "next/headers";

const mockAuth = auth as jest.Mock;
const mockOauthLimiter = oauthLimiter as jest.Mock;
const mockBuildOAuthUrl = buildOAuthUrl as jest.Mock;
const mockExchangeCode = exchangeCodeForShortLivedToken as jest.Mock;
const mockExchangeLong = exchangeForLongLivedToken as jest.Mock;
const mockGetPages = getUserPages as jest.Mock;
const mockGetIg = getPageInstagramAccount as jest.Mock;
const mockGetThreads = getThreadsUser as jest.Mock;
const mockStore = storeOrUpdateSocialAccount as jest.Mock;
const mockCookies = cookies as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 10, remaining: 9, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 10, remaining: 0, resetAt: new Date() };

function makeConnectRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/oauth/meta/connect");
}

function makeCallbackRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/oauth/meta/callback");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

// ── Connect tests ────────────────────────────────────────────────────────────

describe("GET /api/oauth/meta/connect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.META_APP_ID = "test-app-id";
    process.env.META_OAUTH_CALLBACK_URL = "http://localhost:3000/api/oauth/meta/callback";
  });

  afterEach(() => {
    delete process.env.META_APP_ID;
    delete process.env.META_OAUTH_CALLBACK_URL;
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await connectGET(makeConnectRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockOauthLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await connectGET(makeConnectRequest());
    expect(res.status).toBe(429);
  });

  it("redirects to Meta OAuth URL and sets state cookie", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockOauthLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockBuildOAuthUrl.mockReturnValueOnce("https://www.facebook.com/v21.0/dialog/oauth?state=abc");

    const res = await connectGET(makeConnectRequest());

    // Should be a redirect (3xx)
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);

    // Should redirect to Meta OAuth URL
    const location = res.headers.get("location");
    expect(location).toContain("facebook.com");

    // Should set a state cookie
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("meta_oauth_state");
  });

  it("calls buildOAuthUrl with a generated state", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockOauthLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockBuildOAuthUrl.mockReturnValueOnce("https://www.facebook.com/v21.0/dialog/oauth?state=xyz");

    await connectGET(makeConnectRequest());

    expect(mockBuildOAuthUrl).toHaveBeenCalledTimes(1);
    // The state passed should be a hex string (32 random bytes = 64 hex chars)
    const [state] = mockBuildOAuthUrl.mock.calls[0] as [string];
    expect(state).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── Callback tests ───────────────────────────────────────────────────────────

describe("GET /api/oauth/meta/callback", () => {
  const VALID_STATE = "a".repeat(64);
  const VALID_CODE = "auth-code-123";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.META_OAUTH_CALLBACK_URL = "http://localhost:3000/api/oauth/meta/callback";
    mockStore.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.META_OAUTH_CALLBACK_URL;
  });

  function setupCookies(state: string | undefined) {
    const cookieStore = { get: jest.fn() };
    if (state !== undefined) {
      cookieStore.get.mockReturnValue({ value: state });
    } else {
      cookieStore.get.mockReturnValue(undefined);
    }
    mockCookies.mockResolvedValue(cookieStore);
  }

  it("redirects to /login when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await callbackGET(makeCallbackRequest({ code: VALID_CODE, state: VALID_STATE }));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
  });

  it("redirects with error when Meta returns an error param", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await callbackGET(
      makeCallbackRequest({ error: "access_denied", error_description: "User denied access" })
    );
    expect(res.status).toBeGreaterThanOrEqual(300);
    const location = res.headers.get("location");
    expect(location).toContain("/accounts");
    expect(location).toContain("error=");
  });

  it("redirects with missing_params error when code is absent", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const res = await callbackGET(makeCallbackRequest({ state: VALID_STATE }));
    expect(res.status).toBeGreaterThanOrEqual(300);
    const location = res.headers.get("location");
    expect(location).toContain("missing_params");
  });

  it("redirects with invalid_state error when CSRF state does not match", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    setupCookies("different-state-value");
    const res = await callbackGET(makeCallbackRequest({ code: VALID_CODE, state: VALID_STATE }));
    expect(res.status).toBeGreaterThanOrEqual(300);
    const location = res.headers.get("location");
    expect(location).toContain("invalid_state");
  });

  it("redirects with invalid_state error when state cookie is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    setupCookies(undefined);
    const res = await callbackGET(makeCallbackRequest({ code: VALID_CODE, state: VALID_STATE }));
    expect(res.status).toBeGreaterThanOrEqual(300);
    const location = res.headers.get("location");
    expect(location).toContain("invalid_state");
  });

  it("completes full OAuth flow and redirects to /accounts?success=connected", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    setupCookies(VALID_STATE);

    mockExchangeCode.mockResolvedValueOnce({ accessToken: "short-lived-token" });
    mockExchangeLong.mockResolvedValueOnce({
      accessToken: "long-lived-token",
      expiresIn: 5184000,
    });
    mockGetPages.mockResolvedValueOnce([
      { id: "page-1", name: "My Page", access_token: "page-token" },
    ]);
    mockGetIg.mockResolvedValueOnce({
      id: "page-1",
      name: "My Page",
      instagram_business_account: { id: "ig-123" },
    });
    mockGetThreads.mockResolvedValueOnce({ id: "threads-123", username: "myuser" });

    const res = await callbackGET(makeCallbackRequest({ code: VALID_CODE, state: VALID_STATE }));
    expect(res.status).toBeGreaterThanOrEqual(300);
    const location = res.headers.get("location");
    expect(location).toContain("/accounts");
    expect(location).toContain("success=connected");

    // Should have stored at least 3 accounts: FB page + IG + Threads
    expect(mockStore).toHaveBeenCalledTimes(3);
  });

  it("completes flow even when Threads fetch fails (non-fatal)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    setupCookies(VALID_STATE);

    mockExchangeCode.mockResolvedValueOnce({ accessToken: "short-token" });
    mockExchangeLong.mockResolvedValueOnce({ accessToken: "long-token", expiresIn: 5184000 });
    mockGetPages.mockResolvedValueOnce([
      { id: "page-1", name: "My Page", access_token: "page-token" },
    ]);
    mockGetIg.mockResolvedValueOnce({ id: "page-1", name: "My Page" }); // no IG account
    mockGetThreads.mockRejectedValueOnce(new Error("Threads not available"));

    const res = await callbackGET(makeCallbackRequest({ code: VALID_CODE, state: VALID_STATE }));
    const location = res.headers.get("location");
    expect(location).toContain("success=connected");
    // Only FB page stored (no IG since no instagram_business_account, no Threads due to error)
    expect(mockStore).toHaveBeenCalledTimes(1);
  });

  it("redirects to /accounts?error=oauth_failed when token exchange fails", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    setupCookies(VALID_STATE);

    mockExchangeCode.mockRejectedValueOnce(new Error("Invalid code"));

    const res = await callbackGET(makeCallbackRequest({ code: VALID_CODE, state: VALID_STATE }));
    const location = res.headers.get("location");
    expect(location).toContain("oauth_failed");
  });
});
