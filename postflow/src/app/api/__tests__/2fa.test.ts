jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/totp", () => ({
  generateTotpSecret: jest.fn(),
  encryptTotpSecret: jest.fn(),
  decryptTotpSecret: jest.fn(),
  getTotpUri: jest.fn(),
  generateQrCodeDataUrl: jest.fn(),
  verifyTotpCode: jest.fn(),
  findMatchingBackupCode: jest.fn(),
  generateBackupCodes: jest.fn(),
  hashBackupCode: jest.fn(),
  createTotpChallengeToken: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET as setup } from "@/app/api/auth/2fa/setup/route";
import { POST as enable } from "@/app/api/auth/2fa/enable/route";
import { POST as disable } from "@/app/api/auth/2fa/disable/route";
import { POST as challenge } from "@/app/api/auth/2fa/challenge/route";
import { POST as backupCodes } from "@/app/api/auth/2fa/backup-codes/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import * as totpLib from "@/lib/totp";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockGenSecret = totpLib.generateTotpSecret as jest.Mock;
const mockEncryptSecret = totpLib.encryptTotpSecret as jest.Mock;
const mockDecryptSecret = totpLib.decryptTotpSecret as jest.Mock;
const mockGetUri = totpLib.getTotpUri as jest.Mock;
const mockGetQr = totpLib.generateQrCodeDataUrl as jest.Mock;
const mockVerifyCode = totpLib.verifyTotpCode as jest.Mock;
const mockFindBackup = totpLib.findMatchingBackupCode as jest.Mock;
const mockGenBackups = totpLib.generateBackupCodes as jest.Mock;
const mockHashBackup = totpLib.hashBackupCode as jest.Mock;
const mockCreateToken = totpLib.createTotpChallengeToken as jest.Mock;

const USER_ID = "cluser0001";
const SESSION = { user: { id: USER_ID, email: "user@example.com" } };
const SESSION_TOTP_VERIFIED = {
  user: { id: USER_ID, email: "user@example.com", totpVerified: true },
};
const SESSION_TOTP_PENDING = {
  user: { id: USER_ID, email: "user@example.com", totpVerified: false },
};

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/2fa/test", {
    method: "POST",
    ...(body
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}

beforeEach(() => jest.clearAllMocks());

// ── GET /api/auth/2fa/setup ────────────────────────────────────────────────────

describe("GET /api/auth/2fa/setup", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await setup();
    expect(res.status).toBe(401);
  });

  it("returns 404 when user not found in DB", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await setup();
    expect(res.status).toBe(404);
  });

  it("reuses existing unconfirmed secret when totpEnabled=false", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    mockFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      totpSecret: "encrypted_secret",
      totpEnabled: false,
    });
    mockDecryptSecret.mockReturnValueOnce("DECRYPTEDSECRET");
    mockGetUri.mockReturnValueOnce("otpauth://totp/...");
    mockGetQr.mockResolvedValueOnce("data:image/png;base64,abc");

    const res = await setup();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { qrCode: string; secret: string };
    expect(data.qrCode).toBe("data:image/png;base64,abc");
    expect(data.secret).toBe("DECRYPTEDSECRET");
    expect(mockGenSecret).not.toHaveBeenCalled();
  });

  it("generates fresh secret when totpEnabled=true", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    mockFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      totpSecret: "old_encrypted",
      totpEnabled: true,
    });
    mockGenSecret.mockReturnValueOnce("NEWSECRET");
    mockEncryptSecret.mockReturnValueOnce("new_encrypted");
    mockGetUri.mockReturnValueOnce("otpauth://totp/...");
    mockGetQr.mockResolvedValueOnce("data:image/png;base64,xyz");
    mockUpdate.mockResolvedValueOnce({});

    const res = await setup();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { qrCode: string; secret: string };
    expect(data.secret).toBe("NEWSECRET");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totpSecret: "new_encrypted" }),
      })
    );
  });
});

// ── POST /api/auth/2fa/enable ──────────────────────────────────────────────────

describe("POST /api/auth/2fa/enable", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await enable(makeRequest({ code: "123456" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    const res = await enable(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no TOTP secret exists", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    mockFindUnique.mockResolvedValueOnce({ totpSecret: null, totpEnabled: false });
    const res = await enable(makeRequest({ code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when 2FA already enabled", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    mockFindUnique.mockResolvedValueOnce({
      totpSecret: "encrypted",
      totpEnabled: true,
    });
    const res = await enable(makeRequest({ code: "123456" }));
    expect(res.status).toBe(409);
  });

  it("returns 422 for invalid TOTP code", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    mockFindUnique.mockResolvedValueOnce({
      totpSecret: "encrypted",
      totpEnabled: false,
    });
    mockDecryptSecret.mockReturnValueOnce("SECRET");
    mockVerifyCode.mockReturnValueOnce(false);
    const res = await enable(makeRequest({ code: "000000" }));
    expect(res.status).toBe(422);
  });

  it("returns 200 with backup codes on success", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    mockFindUnique.mockResolvedValueOnce({
      totpSecret: "encrypted",
      totpEnabled: false,
    });
    mockDecryptSecret.mockReturnValueOnce("SECRET");
    mockVerifyCode.mockReturnValueOnce(true);
    mockGenBackups.mockReturnValueOnce(["CODE1-ABCDEF", "CODE2-ABCDEF"]);
    mockHashBackup.mockImplementation((c: string) => `hash:${c}`);
    mockUpdate.mockResolvedValueOnce({});

    const res = await enable(makeRequest({ code: "123456" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { backupCodes: string[] };
    expect(data.backupCodes).toHaveLength(2);
  });
});

// ── POST /api/auth/2fa/disable ─────────────────────────────────────────────────

describe("POST /api/auth/2fa/disable", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await disable(makeRequest({ code: "123456" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    const res = await disable(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when 2FA not enabled", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    mockFindUnique.mockResolvedValueOnce({
      totpSecret: null,
      totpEnabled: false,
      totpBackupCodes: [],
    });
    const res = await disable(makeRequest({ code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 422 when TOTP code invalid and no backup match", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    mockFindUnique.mockResolvedValueOnce({
      totpSecret: "encrypted",
      totpEnabled: true,
      totpBackupCodes: ["hash1"],
    });
    mockDecryptSecret.mockReturnValueOnce("SECRET");
    mockVerifyCode.mockReturnValueOnce(false);
    mockFindBackup.mockReturnValueOnce(null);
    const res = await disable(makeRequest({ code: "badcode" }));
    expect(res.status).toBe(422);
  });

  it("returns 200 when disabled with valid TOTP code", async () => {
    mockAuth.mockResolvedValueOnce(SESSION);
    mockFindUnique.mockResolvedValueOnce({
      totpSecret: "encrypted",
      totpEnabled: true,
      totpBackupCodes: [],
    });
    mockDecryptSecret.mockReturnValueOnce("SECRET");
    mockVerifyCode.mockReturnValueOnce(true);
    mockUpdate.mockResolvedValueOnce({});

    const res = await disable(makeRequest({ code: "123456" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totpEnabled: false,
          totpSecret: null,
        }),
      })
    );
  });
});

// ── POST /api/auth/2fa/challenge ───────────────────────────────────────────────

describe("POST /api/auth/2fa/challenge", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await challenge(makeRequest({ code: "123456" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when TOTP already verified", async () => {
    mockAuth.mockResolvedValueOnce(SESSION_TOTP_VERIFIED);
    const res = await challenge(makeRequest({ code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValueOnce(SESSION_TOTP_PENDING);
    const res = await challenge(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when 2FA not configured", async () => {
    mockAuth.mockResolvedValueOnce(SESSION_TOTP_PENDING);
    mockFindUnique.mockResolvedValueOnce({
      totpSecret: null,
      totpEnabled: false,
      totpBackupCodes: [],
    });
    const res = await challenge(makeRequest({ code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 422 when code invalid and no backup match", async () => {
    mockAuth.mockResolvedValueOnce(SESSION_TOTP_PENDING);
    mockFindUnique.mockResolvedValueOnce({
      totpSecret: "encrypted",
      totpEnabled: true,
      totpBackupCodes: ["hash1"],
    });
    mockDecryptSecret.mockReturnValueOnce("SECRET");
    mockVerifyCode.mockReturnValueOnce(false);
    mockFindBackup.mockReturnValueOnce(null);
    const res = await challenge(makeRequest({ code: "badcode" }));
    expect(res.status).toBe(422);
  });

  it("consumes backup code and returns verification token", async () => {
    const backupHash = "bkhash1";
    mockAuth.mockResolvedValueOnce(SESSION_TOTP_PENDING);
    mockFindUnique.mockResolvedValueOnce({
      totpSecret: "encrypted",
      totpEnabled: true,
      totpBackupCodes: [backupHash, "bkhash2"],
    });
    mockDecryptSecret.mockReturnValueOnce("SECRET");
    mockVerifyCode.mockReturnValueOnce(false);
    mockFindBackup.mockReturnValueOnce(backupHash);
    mockUpdate.mockResolvedValueOnce({});
    mockCreateToken.mockResolvedValueOnce("hmac_token_abc");

    const res = await challenge(makeRequest({ code: "ABCDEF-123456" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { verificationToken: string };
    expect(data.verificationToken).toBe("hmac_token_abc");
    // Backup code removed
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totpBackupCodes: ["bkhash2"],
        }),
      })
    );
  });

  it("returns verification token on valid TOTP code", async () => {
    mockAuth.mockResolvedValueOnce(SESSION_TOTP_PENDING);
    mockFindUnique.mockResolvedValueOnce({
      totpSecret: "encrypted",
      totpEnabled: true,
      totpBackupCodes: [],
    });
    mockDecryptSecret.mockReturnValueOnce("SECRET");
    mockVerifyCode.mockReturnValueOnce(true);
    mockCreateToken.mockResolvedValueOnce("hmac_token_xyz");

    const res = await challenge(makeRequest({ code: "123456" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { verificationToken: string };
    expect(data.verificationToken).toBe("hmac_token_xyz");
  });
});

// ── POST /api/auth/2fa/backup-codes ───────────────────────────────────────────

describe("POST /api/auth/2fa/backup-codes", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await backupCodes(makeRequest({ code: "123456" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when TOTP not verified in session", async () => {
    mockAuth.mockResolvedValueOnce(SESSION_TOTP_PENDING);
    const res = await backupCodes(makeRequest({ code: "123456" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValueOnce(SESSION_TOTP_VERIFIED);
    const res = await backupCodes(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when 2FA not enabled", async () => {
    mockAuth.mockResolvedValueOnce(SESSION_TOTP_VERIFIED);
    mockFindUnique.mockResolvedValueOnce({ totpSecret: null, totpEnabled: false });
    const res = await backupCodes(makeRequest({ code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 422 when TOTP code invalid", async () => {
    mockAuth.mockResolvedValueOnce(SESSION_TOTP_VERIFIED);
    mockFindUnique.mockResolvedValueOnce({ totpSecret: "encrypted", totpEnabled: true });
    mockDecryptSecret.mockReturnValueOnce("SECRET");
    mockVerifyCode.mockReturnValueOnce(false);
    const res = await backupCodes(makeRequest({ code: "000000" }));
    expect(res.status).toBe(422);
  });

  it("returns new backup codes on success", async () => {
    mockAuth.mockResolvedValueOnce(SESSION_TOTP_VERIFIED);
    mockFindUnique.mockResolvedValueOnce({ totpSecret: "encrypted", totpEnabled: true });
    mockDecryptSecret.mockReturnValueOnce("SECRET");
    mockVerifyCode.mockReturnValueOnce(true);
    mockGenBackups.mockReturnValueOnce(["NEW1-ABCDEF", "NEW2-ABCDEF"]);
    mockHashBackup.mockImplementation((c: string) => `hash:${c}`);
    mockUpdate.mockResolvedValueOnce({});

    const res = await backupCodes(makeRequest({ code: "123456" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { backupCodes: string[] };
    expect(data.backupCodes).toHaveLength(2);
    expect(data.backupCodes[0]).toBe("NEW1-ABCDEF");
  });
});
