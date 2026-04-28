jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
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
  generateTotpSecret: jest.fn().mockReturnValue("BASE32SECRET"),
  encryptTotpSecret: jest.fn().mockReturnValue("encrypted:secret"),
  decryptTotpSecret: jest.fn().mockReturnValue("BASE32SECRET"),
  getTotpUri: jest.fn().mockReturnValue("otpauth://totp/PostFlow:test@test.com?secret=BASE32SECRET"),
  generateQrCodeDataUrl: jest.fn().mockResolvedValue("data:image/png;base64,abc123"),
  verifyTotpCode: jest.fn(),
  findMatchingBackupCode: jest.fn(),
  generateBackupCodes: jest.fn().mockReturnValue(["AABBCC-DDEEFF", "112233-445566"]),
  hashBackupCode: jest.fn((c: string) => `hash:${c}`),
  createTotpChallengeToken: jest.fn().mockResolvedValue("hmac-token-123"),
}));

import { NextRequest } from "next/server";
import { GET as setupGet } from "@/app/api/auth/2fa/setup/route";
import { POST as enablePost } from "@/app/api/auth/2fa/enable/route";
import { POST as disablePost } from "@/app/api/auth/2fa/disable/route";
import { POST as challengePost } from "@/app/api/auth/2fa/challenge/route";
import { POST as backupCodesPost } from "@/app/api/auth/2fa/backup-codes/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  verifyTotpCode,
  findMatchingBackupCode,
} from "@/lib/totp";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockVerifyTotpCode = verifyTotpCode as jest.Mock;
const mockFindMatchingBackupCode = findMatchingBackupCode as jest.Mock;

const USER_ID = "cluser001";
const FULL_SESSION = { user: { id: USER_ID, totpEnabled: true, totpVerified: true } };
const PARTIAL_SESSION = { user: { id: USER_ID, totpEnabled: true, totpVerified: false } };
const NO_2FA_SESSION = { user: { id: USER_ID, totpEnabled: false, totpVerified: true } };

function req(method = "GET", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/2fa/test", {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

describe("GET /api/auth/2fa/setup", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await setupGet();
    expect(res.status).toBe(401);
  });

  it("generates a new secret when none exists", async () => {
    mockAuth.mockResolvedValue(NO_2FA_SESSION);
    mockFindUnique.mockResolvedValue({
      email: "user@test.com",
      totpSecret: null,
      totpEnabled: false,
    });
    mockUpdate.mockResolvedValue({});

    const res = await setupGet();
    expect(res.status).toBe(200);
    const body = await res.json() as { qrCode: string; secret: string };
    expect(body.qrCode).toMatch(/^data:image\/png;base64/);
    expect(body.secret).toBe("BASE32SECRET");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("reuses existing unconfirmed secret", async () => {
    mockAuth.mockResolvedValue(NO_2FA_SESSION);
    mockFindUnique.mockResolvedValue({
      email: "user@test.com",
      totpSecret: "encrypted:secret",
      totpEnabled: false,
    });

    const res = await setupGet();
    expect(res.status).toBe(200);
    // Should NOT generate a new one
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ─── Enable ───────────────────────────────────────────────────────────────────

describe("POST /api/auth/2fa/enable", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await enablePost(req("POST", { code: "123456" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no setup has been run", async () => {
    mockAuth.mockResolvedValue(NO_2FA_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: null, totpEnabled: false });
    const res = await enablePost(req("POST", { code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when already enabled", async () => {
    mockAuth.mockResolvedValue(FULL_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: "enc", totpEnabled: true });
    const res = await enablePost(req("POST", { code: "123456" }));
    expect(res.status).toBe(409);
  });

  it("returns 422 for invalid code", async () => {
    mockAuth.mockResolvedValue(NO_2FA_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: "enc", totpEnabled: false });
    mockVerifyTotpCode.mockReturnValue(false);
    const res = await enablePost(req("POST", { code: "000000" }));
    expect(res.status).toBe(422);
  });

  it("enables 2FA and returns backup codes on valid code", async () => {
    mockAuth.mockResolvedValue(NO_2FA_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: "enc", totpEnabled: false });
    mockVerifyTotpCode.mockReturnValue(true);
    mockUpdate.mockResolvedValue({});

    const res = await enablePost(req("POST", { code: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { backupCodes: string[] };
    expect(Array.isArray(body.backupCodes)).toBe(true);
    expect(body.backupCodes.length).toBeGreaterThan(0);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totpEnabled: true }),
      })
    );
  });
});

// ─── Disable ──────────────────────────────────────────────────────────────────

describe("POST /api/auth/2fa/disable", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await disablePost(req("POST", { code: "123456" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when 2FA is not enabled", async () => {
    mockAuth.mockResolvedValue(NO_2FA_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: null, totpEnabled: false, totpBackupCodes: [] });
    const res = await disablePost(req("POST", { code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 422 for invalid TOTP and no matching backup", async () => {
    mockAuth.mockResolvedValue(FULL_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: "enc", totpEnabled: true, totpBackupCodes: ["hash:ABC"] });
    mockVerifyTotpCode.mockReturnValue(false);
    mockFindMatchingBackupCode.mockReturnValue(null);
    const res = await disablePost(req("POST", { code: "000000" }));
    expect(res.status).toBe(422);
  });

  it("disables 2FA on valid TOTP code", async () => {
    mockAuth.mockResolvedValue(FULL_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: "enc", totpEnabled: true, totpBackupCodes: [] });
    mockVerifyTotpCode.mockReturnValue(true);
    mockUpdate.mockResolvedValue({});

    const res = await disablePost(req("POST", { code: "123456" }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totpEnabled: false, totpSecret: null }),
      })
    );
  });

  it("disables 2FA on valid backup code", async () => {
    mockAuth.mockResolvedValue(FULL_SESSION);
    mockFindUnique.mockResolvedValue({
      totpSecret: "enc",
      totpEnabled: true,
      totpBackupCodes: ["hash:AABBCC-DDEEFF"],
    });
    mockVerifyTotpCode.mockReturnValue(false);
    mockFindMatchingBackupCode.mockReturnValue("hash:AABBCC-DDEEFF");
    mockUpdate.mockResolvedValue({});

    const res = await disablePost(req("POST", { code: "AABBCC-DDEEFF" }));
    expect(res.status).toBe(200);
  });
});

// ─── Challenge ────────────────────────────────────────────────────────────────

describe("POST /api/auth/2fa/challenge", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await challengePost(req("POST", { code: "123456" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when 2FA is already verified", async () => {
    mockAuth.mockResolvedValue(FULL_SESSION);
    const res = await challengePost(req("POST", { code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 422 for invalid code", async () => {
    mockAuth.mockResolvedValue(PARTIAL_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: "enc", totpEnabled: true, totpBackupCodes: [] });
    mockVerifyTotpCode.mockReturnValue(false);
    mockFindMatchingBackupCode.mockReturnValue(null);
    const res = await challengePost(req("POST", { code: "000000" }));
    expect(res.status).toBe(422);
  });

  it("returns verification token on valid TOTP code", async () => {
    mockAuth.mockResolvedValue(PARTIAL_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: "enc", totpEnabled: true, totpBackupCodes: [] });
    mockVerifyTotpCode.mockReturnValue(true);

    const res = await challengePost(req("POST", { code: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { verificationToken: string };
    expect(typeof body.verificationToken).toBe("string");
  });

  it("consumes backup code on valid backup code", async () => {
    mockAuth.mockResolvedValue(PARTIAL_SESSION);
    mockFindUnique.mockResolvedValue({
      totpSecret: "enc",
      totpEnabled: true,
      totpBackupCodes: ["hash:AABBCC-DDEEFF"],
    });
    mockVerifyTotpCode.mockReturnValue(false);
    mockFindMatchingBackupCode.mockReturnValue("hash:AABBCC-DDEEFF");
    mockUpdate.mockResolvedValue({});

    const res = await challengePost(req("POST", { code: "AABBCC-DDEEFF" }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totpBackupCodes: [] }),
      })
    );
  });
});

// ─── Backup codes regeneration ────────────────────────────────────────────────

describe("POST /api/auth/2fa/backup-codes", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await backupCodesPost(req("POST", { code: "123456" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when TOTP is not yet verified in session", async () => {
    mockAuth.mockResolvedValue(PARTIAL_SESSION);
    const res = await backupCodesPost(req("POST", { code: "123456" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when 2FA is not enabled", async () => {
    mockAuth.mockResolvedValue(NO_2FA_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: null, totpEnabled: false });
    const res = await backupCodesPost(req("POST", { code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 422 for invalid code", async () => {
    mockAuth.mockResolvedValue(FULL_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: "enc", totpEnabled: true });
    mockVerifyTotpCode.mockReturnValue(false);
    const res = await backupCodesPost(req("POST", { code: "000000" }));
    expect(res.status).toBe(422);
  });

  it("regenerates backup codes on valid code", async () => {
    mockAuth.mockResolvedValue(FULL_SESSION);
    mockFindUnique.mockResolvedValue({ totpSecret: "enc", totpEnabled: true });
    mockVerifyTotpCode.mockReturnValue(true);
    mockUpdate.mockResolvedValue({});

    const res = await backupCodesPost(req("POST", { code: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { backupCodes: string[] };
    expect(Array.isArray(body.backupCodes)).toBe(true);
  });
});
