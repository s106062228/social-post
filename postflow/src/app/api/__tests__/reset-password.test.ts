jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/lib/password", () => ({
  hashPassword: jest.fn().mockResolvedValue("hashed_new_password"),
}));

import { NextRequest } from "next/server";
import { POST as requestReset } from "@/app/api/auth/reset-password/request/route";
import { POST as confirmReset } from "@/app/api/auth/reset-password/confirm/route";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";

const mockFindUser = prisma.user.findUnique as jest.Mock;
const mockUpdateUser = prisma.user.update as jest.Mock;
const mockFindToken = prisma.passwordResetToken.findUnique as jest.Mock;
const mockCreateToken = prisma.passwordResetToken.create as jest.Mock;
const mockDeleteToken = prisma.passwordResetToken.delete as jest.Mock;
const mockDeleteManyTokens = prisma.passwordResetToken.deleteMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;

const USER_ID = "cluser0001";
const BASE_USER = {
  id: USER_ID,
  email: "user@example.com",
  name: "Test User",
  password: "hashed_password",
};

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/reset-password/request", {
    method: "POST",
    ...(body
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}

function makeConfirmRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/reset-password/confirm", {
    method: "POST",
    ...(body
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}

beforeEach(() => jest.clearAllMocks());

// ── POST /api/auth/reset-password/request ─────────────────────────────────────

describe("POST /api/auth/reset-password/request", () => {
  it("returns 400 for invalid body (missing email)", async () => {
    const res = await requestReset(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await requestReset(makeRequest({ email: "notanemail" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 when email not found (prevents enumeration)", async () => {
    mockFindUser.mockResolvedValueOnce(null);
    const res = await requestReset(makeRequest({ email: "nobody@example.com" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(mockCreateToken).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 200 for OAuth-only users (no password)", async () => {
    mockFindUser.mockResolvedValueOnce({ ...BASE_USER, password: null });
    const res = await requestReset(makeRequest({ email: BASE_USER.email }));
    expect(res.status).toBe(200);
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it("creates token and fires email on success", async () => {
    mockFindUser.mockResolvedValueOnce(BASE_USER);
    mockDeleteManyTokens.mockResolvedValueOnce({ count: 0 });
    mockCreateToken.mockResolvedValueOnce({ id: "tok1" });
    mockSendEmail.mockResolvedValueOnce(true);

    const res = await requestReset(makeRequest({ email: BASE_USER.email }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(mockDeleteManyTokens).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(mockCreateToken).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      })
    );
  });

  it("returns 200 even when email sending fails (fire-and-forget)", async () => {
    mockFindUser.mockResolvedValueOnce(BASE_USER);
    mockDeleteManyTokens.mockResolvedValueOnce({ count: 0 });
    mockCreateToken.mockResolvedValueOnce({ id: "tok1" });
    mockSendEmail.mockRejectedValueOnce(new Error("SMTP down"));

    const res = await requestReset(makeRequest({ email: BASE_USER.email }));
    expect(res.status).toBe(200);
  });
});

// ── POST /api/auth/reset-password/confirm ─────────────────────────────────────

describe("POST /api/auth/reset-password/confirm", () => {
  it("returns 400 for invalid body (missing fields)", async () => {
    const res = await confirmReset(makeConfirmRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const res = await confirmReset(
      makeConfirmRequest({ token: "abc123", password: "short" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 for unknown token", async () => {
    mockFindToken.mockResolvedValueOnce(null);
    const res = await confirmReset(
      makeConfirmRequest({ token: "unknowntoken", password: "newpassword123" })
    );
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("expired");
  });

  it("returns 422 for expired token", async () => {
    const expiredDate = new Date(Date.now() - 1000);
    mockFindToken.mockResolvedValueOnce({
      id: "tok1",
      userId: USER_ID,
      expiresAt: expiredDate,
    });
    mockDeleteToken.mockResolvedValueOnce({});

    const res = await confirmReset(
      makeConfirmRequest({ token: "expiredtoken", password: "newpassword123" })
    );
    expect(res.status).toBe(422);
    expect(mockDeleteToken).toHaveBeenCalledWith({ where: { id: "tok1" } });
  });

  it("returns 200 and updates password on valid token", async () => {
    const futureDate = new Date(Date.now() + 3600_000);
    mockFindToken.mockResolvedValueOnce({
      id: "tok1",
      userId: USER_ID,
      expiresAt: futureDate,
    });
    mockTransaction.mockImplementationOnce(async (ops: unknown[]) => {
      for (const op of ops) {
        await (op as Promise<unknown>);
      }
      return [];
    });
    mockUpdateUser.mockResolvedValueOnce({});
    mockDeleteManyTokens.mockResolvedValueOnce({ count: 1 });

    const res = await confirmReset(
      makeConfirmRequest({ token: "validtoken", password: "newpassword123" })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
  });
});
