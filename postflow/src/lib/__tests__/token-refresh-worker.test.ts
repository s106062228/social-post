jest.mock("bullmq", () => ({ Worker: jest.fn() }));

jest.mock("@/lib/logger", () => ({
  workerLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    socialAccount: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("@/lib/encryption", () => ({
  encryptToken: jest.fn(),
  decryptToken: jest.fn(),
}));

jest.mock("@/lib/auth/meta-oauth", () => ({
  exchangeForLongLivedToken: jest.fn(),
}));

jest.mock("@/lib/queue/connection", () => ({
  createRedisConnection: jest.fn().mockReturnValue({}),
  QUEUE_NAMES: { TOKEN_REFRESH: "postflow:token-refresh" },
}));

import { Worker } from "bullmq";
import {
  createTokenRefreshWorker,
  type TokenRefreshJobData,
} from "@/lib/queue/workers/refresh";
import { prisma } from "@/lib/db";
import { encryptToken, decryptToken } from "@/lib/encryption";
import { exchangeForLongLivedToken } from "@/lib/auth/meta-oauth";

type MockJob = { data: TokenRefreshJobData };
type ProcessorFn = (job: MockJob) => Promise<void>;

const mockAccountFindUnique = prisma.socialAccount.findUnique as jest.Mock;
const mockAccountUpdate = prisma.socialAccount.update as jest.Mock;
const mockDecryptToken = decryptToken as jest.Mock;
const mockEncryptToken = encryptToken as jest.Mock;
const mockExchange = exchangeForLongLivedToken as jest.Mock;

const ACCOUNT_ID = "clh3ck8zp0001qr5hyvxckahk";
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

const ACTIVE_ACCOUNT = {
  id: ACCOUNT_ID,
  isActive: true,
  encryptedToken: "enc:old-token",
  tokenExpiresAt: new Date(Date.now() + SIXTY_DAYS_MS),
};

const JOB_DATA: TokenRefreshJobData = { socialAccountId: ACCOUNT_ID };

describe("createTokenRefreshWorker", () => {
  let processor: ProcessorFn;

  beforeEach(() => {
    (Worker as jest.Mock).mockImplementation(
      (_name: string, proc: ProcessorFn) => {
        processor = proc;
        return { on: jest.fn() };
      }
    );
    createTokenRefreshWorker();
  });

  describe("processTokenRefreshJob (processor function)", () => {
    it("returns without acting when account is not found", async () => {
      mockAccountFindUnique.mockResolvedValueOnce(null);

      await processor({ data: JOB_DATA });

      expect(mockDecryptToken).not.toHaveBeenCalled();
      expect(mockExchange).not.toHaveBeenCalled();
      expect(mockAccountUpdate).not.toHaveBeenCalled();
    });

    it("returns without acting when account is inactive", async () => {
      mockAccountFindUnique.mockResolvedValueOnce({
        ...ACTIVE_ACCOUNT,
        isActive: false,
      });

      await processor({ data: JOB_DATA });

      expect(mockDecryptToken).not.toHaveBeenCalled();
      expect(mockExchange).not.toHaveBeenCalled();
    });

    it("returns without acting when tokenExpiresAt is null (page token)", async () => {
      mockAccountFindUnique.mockResolvedValueOnce({
        ...ACTIVE_ACCOUNT,
        tokenExpiresAt: null,
      });

      await processor({ data: JOB_DATA });

      expect(mockDecryptToken).not.toHaveBeenCalled();
      expect(mockExchange).not.toHaveBeenCalled();
    });

    it("decrypts the stored token and exchanges it for a long-lived one", async () => {
      mockAccountFindUnique.mockResolvedValueOnce(ACTIVE_ACCOUNT);
      mockDecryptToken.mockReturnValueOnce("plain-old-token");
      mockExchange.mockResolvedValueOnce({
        accessToken: "new-long-lived-token",
        expiresIn: 5_184_000,
      });
      mockEncryptToken.mockReturnValueOnce("enc:new-token");
      mockAccountUpdate.mockResolvedValueOnce({});

      await processor({ data: JOB_DATA });

      expect(mockDecryptToken).toHaveBeenCalledWith("enc:old-token");
      expect(mockExchange).toHaveBeenCalledWith("plain-old-token");
    });

    it("encrypts the new token and updates the database", async () => {
      mockAccountFindUnique.mockResolvedValueOnce(ACTIVE_ACCOUNT);
      mockDecryptToken.mockReturnValueOnce("plain-old-token");
      mockExchange.mockResolvedValueOnce({
        accessToken: "refreshed-token",
        expiresIn: 5_184_000,
      });
      mockEncryptToken.mockReturnValueOnce("enc:refreshed");
      mockAccountUpdate.mockResolvedValueOnce({});

      await processor({ data: JOB_DATA });

      expect(mockEncryptToken).toHaveBeenCalledWith("refreshed-token");
      expect(mockAccountUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ACCOUNT_ID },
          data: expect.objectContaining({ encryptedToken: "enc:refreshed" }),
        })
      );
    });

    it("sets tokenExpiresAt to now + expiresIn seconds", async () => {
      const expiresIn = 3600;
      const before = Date.now();

      mockAccountFindUnique.mockResolvedValueOnce(ACTIVE_ACCOUNT);
      mockDecryptToken.mockReturnValueOnce("old-token");
      mockExchange.mockResolvedValueOnce({
        accessToken: "new-token",
        expiresIn,
      });
      mockEncryptToken.mockReturnValueOnce("enc:new-token");
      mockAccountUpdate.mockResolvedValueOnce({});

      await processor({ data: JOB_DATA });

      const after = Date.now();
      const updateArg = (
        mockAccountUpdate.mock.calls[0] as [
          { where: unknown; data: { tokenExpiresAt: Date } }
        ]
      )[0];
      const newExpiry = updateArg.data.tokenExpiresAt.getTime();

      expect(newExpiry).toBeGreaterThanOrEqual(before + expiresIn * 1000);
      expect(newExpiry).toBeLessThanOrEqual(after + expiresIn * 1000);
    });

    it("propagates errors thrown by exchangeForLongLivedToken", async () => {
      mockAccountFindUnique.mockResolvedValueOnce(ACTIVE_ACCOUNT);
      mockDecryptToken.mockReturnValueOnce("old-token");
      mockExchange.mockRejectedValueOnce(new Error("Meta API error"));

      await expect(processor({ data: JOB_DATA })).rejects.toThrow(
        "Meta API error"
      );
      expect(mockAccountUpdate).not.toHaveBeenCalled();
    });
  });
});
