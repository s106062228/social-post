jest.mock("bullmq", () => ({ Worker: jest.fn() }));

jest.mock("@/lib/logger", () => ({
  workerLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    socialAccount: { updateMany: jest.fn() },
  },
}));

jest.mock("@/lib/queue/scheduler", () => ({
  scheduleExpiringTokenRefreshes: jest.fn(),
}));

jest.mock("@/lib/queue/connection", () => ({
  createRedisConnection: jest.fn().mockReturnValue({}),
  QUEUE_NAMES: { TOKEN_EXPIRY_CHECK: "postflow:token-expiry-check" },
}));

import { Worker } from "bullmq";
import {
  createTokenExpiryCheckWorker,
  type TokenExpiryCheckJobData,
} from "@/lib/queue/workers/token-expiry";
import { prisma } from "@/lib/db";
import { scheduleExpiringTokenRefreshes } from "@/lib/queue/scheduler";

type MockJob = { data: TokenExpiryCheckJobData; id?: string };
type ProcessorFn = (job: MockJob) => Promise<void>;
type FailedHandlerFn = (
  job: MockJob | undefined,
  error: Error
) => void;

const mockUpdateMany = prisma.socialAccount.updateMany as jest.Mock;
const mockScheduleRefreshes = scheduleExpiringTokenRefreshes as jest.Mock;

const JOB_DATA: TokenExpiryCheckJobData = {
  triggeredAt: new Date("2024-01-15T02:00:00Z").toISOString(),
};

describe("createTokenExpiryCheckWorker", () => {
  let processor: ProcessorFn;
  let capturedHandlers: Map<string, FailedHandlerFn | ((e: Error) => void)>;

  beforeEach(() => {
    capturedHandlers = new Map();
    const mockOn = jest.fn(
      (event: string, handler: FailedHandlerFn | ((e: Error) => void)) => {
        capturedHandlers.set(event, handler);
      }
    );

    (Worker as unknown as jest.Mock).mockImplementation(
      (_name: string, proc: ProcessorFn) => {
        processor = proc;
        return { on: mockOn };
      }
    );
    createTokenExpiryCheckWorker();
  });

  describe("processTokenExpiryCheckJob (processor function)", () => {
    it("deactivates accounts with already-expired tokens", async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });
      mockScheduleRefreshes.mockResolvedValueOnce(0);

      await processor({ data: JOB_DATA });

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            tokenExpiresAt: expect.objectContaining({
              not: null,
              lt: expect.any(Date),
            }),
          }),
          data: { isActive: false },
        })
      );
    });

    it("calls scheduleExpiringTokenRefreshes with 7-day look-ahead", async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockScheduleRefreshes.mockResolvedValueOnce(5);

      await processor({ data: JOB_DATA });

      expect(mockScheduleRefreshes).toHaveBeenCalledWith(7);
    });

    it("resolves without error when no accounts are expired or expiring", async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockScheduleRefreshes.mockResolvedValueOnce(0);

      await expect(
        processor({ data: JOB_DATA })
      ).resolves.toBeUndefined();
    });

    it("logs a warning when deactivated count is greater than zero", async () => {
      const { workerLogger } = jest.requireMock("@/lib/logger") as {
        workerLogger: { warn: jest.Mock };
      };
      mockUpdateMany.mockResolvedValueOnce({ count: 3 });
      mockScheduleRefreshes.mockResolvedValueOnce(0);

      await processor({ data: JOB_DATA });

      expect(workerLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ count: 3 }),
        expect.stringContaining("Deactivated")
      );
    });

    it("does not log a warning when deactivated count is zero", async () => {
      const { workerLogger } = jest.requireMock("@/lib/logger") as {
        workerLogger: { warn: jest.Mock };
      };
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockScheduleRefreshes.mockResolvedValueOnce(2);

      await processor({ data: JOB_DATA });

      expect(workerLogger.warn).not.toHaveBeenCalled();
    });

    it("logs completion info with both counts", async () => {
      const { workerLogger } = jest.requireMock("@/lib/logger") as {
        workerLogger: { info: jest.Mock };
      };
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });
      mockScheduleRefreshes.mockResolvedValueOnce(4);

      await processor({ data: JOB_DATA });

      expect(workerLogger.info).toHaveBeenLastCalledWith(
        expect.objectContaining({ deactivatedCount: 1, scheduledCount: 4 }),
        expect.any(String)
      );
    });

    it("propagates errors from updateMany", async () => {
      mockUpdateMany.mockRejectedValueOnce(new Error("DB connection lost"));

      await expect(processor({ data: JOB_DATA })).rejects.toThrow(
        "DB connection lost"
      );
      expect(mockScheduleRefreshes).not.toHaveBeenCalled();
    });
  });

  describe("failed event handler", () => {
    it("is registered on the worker", () => {
      expect(capturedHandlers.has("failed")).toBe(true);
    });

    it("logs an error when a job fails", () => {
      const { workerLogger } = jest.requireMock("@/lib/logger") as {
        workerLogger: { error: jest.Mock };
      };
      const failedHandler = capturedHandlers.get("failed") as FailedHandlerFn;

      failedHandler(
        { data: JOB_DATA, id: "job-1" },
        new Error("cron job failed")
      );

      expect(workerLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: "cron job failed" }),
        expect.any(String)
      );
    });
  });
});
