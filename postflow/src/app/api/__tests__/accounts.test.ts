jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
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

jest.mock("@/lib/db", () => ({
  prisma: {
    socialAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    activityLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock("@/lib/activity-log", () => ({
  logActivity: jest.fn(),
}));

jest.mock("@/lib/encryption", () => ({
  decryptToken: jest.fn(),
}));

import { NextRequest } from "next/server";
import { DELETE } from "@/app/api/accounts/[id]/route";
import { POST as CHECK } from "@/app/api/accounts/[id]/check/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { decryptToken } from "@/lib/encryption";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.socialAccount.findUnique as jest.Mock;
const mockUpdate = prisma.socialAccount.update as jest.Mock;
const mockLogActivity = logActivity as jest.Mock;
const mockDecryptToken = decryptToken as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const VALID_ACCOUNT_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const ACTIVE_FACEBOOK_ACCOUNT = {
  id: VALID_ACCOUNT_ID,
  userId: MOCK_USER_ID,
  platform: "FACEBOOK",
  platformAccountId: "fb-page-123",
  accountName: "My Facebook Page",
  encryptedToken: "iv:tag:cipher",
  tokenExpiresAt: null,
  scopes: "pages_manage_posts",
  isActive: true,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const INACTIVE_ACCOUNT = { ...ACTIVE_FACEBOOK_ACCOUNT, isActive: false };

function makeDeleteRequest(id = VALID_ACCOUNT_ID): NextRequest {
  return new NextRequest(`http://localhost:3000/api/accounts/${id}`, {
    method: "DELETE",
  });
}

function makeCheckRequest(id = VALID_ACCOUNT_ID): NextRequest {
  return new NextRequest(`http://localhost:3000/api/accounts/${id}/check`, {
    method: "POST",
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── DELETE /api/accounts/[id] ─────────────────────────────────────────────────

describe("DELETE /api/accounts/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 when account ID is not a valid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await DELETE(makeDeleteRequest("not-a-cuid"), makeParams("not-a-cuid"));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Account not found");
  });

  it("returns 404 when account does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Account not found");
  });

  it("returns 404 when account belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      ...ACTIVE_FACEBOOK_ACCOUNT,
      userId: OTHER_USER_ID,
    });

    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Account not found");
  });

  it("returns 409 when account is already disconnected", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(INACTIVE_ACCOUNT);

    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Account already disconnected");
  });

  it("returns 204 and soft-deletes account on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(ACTIVE_FACEBOOK_ACCOUNT);
    mockUpdate.mockResolvedValueOnce({ ...ACTIVE_FACEBOOK_ACCOUNT, isActive: false });

    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("calls prisma update with isActive=false on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(ACTIVE_FACEBOOK_ACCOUNT);
    mockUpdate.mockResolvedValueOnce({ ...ACTIVE_FACEBOOK_ACCOUNT, isActive: false });

    await DELETE(makeDeleteRequest(), makeParams(VALID_ACCOUNT_ID));

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: VALID_ACCOUNT_ID },
      data: { isActive: false },
    });
  });

  it("calls logActivity with account.disconnected on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(ACTIVE_FACEBOOK_ACCOUNT);
    mockUpdate.mockResolvedValueOnce({ ...ACTIVE_FACEBOOK_ACCOUNT, isActive: false });

    await DELETE(makeDeleteRequest(), makeParams(VALID_ACCOUNT_ID));

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MOCK_USER_ID,
        action: "account.disconnected",
        entityId: VALID_ACCOUNT_ID,
        entityType: "account",
      })
    );
  });
});

// ── POST /api/accounts/[id]/check ─────────────────────────────────────────────

describe("POST /api/accounts/[id]/check", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await CHECK(makeCheckRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 when account ID is not a valid CUID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await CHECK(makeCheckRequest("not-a-cuid"), makeParams("not-a-cuid"));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Account not found");
  });

  it("returns 404 when account does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await CHECK(makeCheckRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when account belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      ...ACTIVE_FACEBOOK_ACCOUNT,
      userId: OTHER_USER_ID,
    });

    const res = await CHECK(makeCheckRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when account is inactive", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(INACTIVE_ACCOUNT);

    const res = await CHECK(makeCheckRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 with valid=false when token decryption fails", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(ACTIVE_FACEBOOK_ACCOUNT);
    mockDecryptToken.mockImplementationOnce(() => {
      throw new Error("Bad key");
    });

    const res = await CHECK(makeCheckRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { valid: boolean; error: string };
    expect(data.valid).toBe(false);
    expect(data.error).toBe("Token decryption failed");
  });

  it("returns 200 with valid=true when Graph API returns 200", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(ACTIVE_FACEBOOK_ACCOUNT);
    mockDecryptToken.mockReturnValueOnce("decrypted-token");
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({ id: "123", name: "My Page" }),
    });

    const res = await CHECK(makeCheckRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      valid: boolean;
      platform: string;
      accountName: string;
    };
    expect(data.valid).toBe(true);
    expect(data.platform).toBe("FACEBOOK");
    expect(data.accountName).toBe("My Facebook Page");
    expect(data).not.toHaveProperty("error");
  });

  it("returns 200 with valid=false when Graph API returns error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(ACTIVE_FACEBOOK_ACCOUNT);
    mockDecryptToken.mockReturnValueOnce("expired-token");
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: jest.fn().mockResolvedValueOnce({
        error: { message: "Invalid OAuth access token" },
      }),
    });

    const res = await CHECK(makeCheckRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { valid: boolean; error: string };
    expect(data.valid).toBe(false);
    expect(data.error).toBe("Invalid OAuth access token");
  });

  it("returns 200 with valid=false when fetch throws a network error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(ACTIVE_FACEBOOK_ACCOUNT);
    mockDecryptToken.mockReturnValueOnce("some-token");
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await CHECK(makeCheckRequest(), makeParams(VALID_ACCOUNT_ID));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { valid: boolean; error: string };
    expect(data.valid).toBe(false);
    expect(data.error).toBe("ECONNREFUSED");
  });

  it("uses graph.threads.net base URL for Threads accounts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      ...ACTIVE_FACEBOOK_ACCOUNT,
      platform: "THREADS",
    });
    mockDecryptToken.mockReturnValueOnce("threads-token");
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({ id: "tid-1", name: "My Threads" }),
    });

    await CHECK(makeCheckRequest(), makeParams(VALID_ACCOUNT_ID));

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain("graph.threads.net");
  });

  it("uses graph.facebook.com base URL for Facebook accounts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce(ACTIVE_FACEBOOK_ACCOUNT);
    mockDecryptToken.mockReturnValueOnce("fb-token");
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({ id: "fb-1", name: "My Page" }),
    });

    await CHECK(makeCheckRequest(), makeParams(VALID_ACCOUNT_ID));

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain("graph.facebook.com");
  });

  it("includes tokenExpiresAt in response", async () => {
    const expiresAt = new Date("2025-12-31T00:00:00Z");
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockFindUnique.mockResolvedValueOnce({
      ...ACTIVE_FACEBOOK_ACCOUNT,
      tokenExpiresAt: expiresAt,
    });
    mockDecryptToken.mockReturnValueOnce("token");
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({ id: "123" }),
    });

    const res = await CHECK(makeCheckRequest(), makeParams(VALID_ACCOUNT_ID));
    const data = (await res.json()) as { tokenExpiresAt: string };
    expect(new Date(data.tokenExpiresAt).toISOString()).toBe(expiresAt.toISOString());
  });
});
