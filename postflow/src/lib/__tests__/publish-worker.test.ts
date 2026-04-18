jest.mock("bullmq", () => ({ Worker: jest.fn() }));

jest.mock("@/lib/logger", () => ({
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock("@prisma/client", () => ({
  Platform: { FACEBOOK: "FACEBOOK", INSTAGRAM: "INSTAGRAM", THREADS: "THREADS" },
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
  PublishStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PUBLISHED: "PUBLISHED",
    FAILED: "FAILED",
  },
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: { findUnique: jest.fn(), update: jest.fn() },
    socialAccount: { findUnique: jest.fn() },
    publishResult: { update: jest.fn(), findMany: jest.fn() },
  },
}));

jest.mock("@/lib/auth/token-manager", () => ({
  getTokenWithRefresh: jest.fn(),
}));

jest.mock("@/lib/platforms/facebook", () => ({
  facebookAdapter: { publish: jest.fn() },
}));

jest.mock("@/lib/platforms/instagram", () => ({
  instagramAdapter: { publish: jest.fn() },
}));

jest.mock("@/lib/platforms/threads", () => ({
  threadsAdapter: { publish: jest.fn() },
}));

jest.mock("@/lib/queue/connection", () => ({
  createRedisConnection: jest.fn().mockReturnValue({}),
  QUEUE_NAMES: { PUBLISH: "postflow:publish" },
}));

import { Worker } from "bullmq";
import {
  createPublishWorker,
  backoffDelay,
  type PublishJobData,
} from "@/lib/queue/workers/publish";
import { prisma } from "@/lib/db";
import { getTokenWithRefresh } from "@/lib/auth/token-manager";
import { facebookAdapter } from "@/lib/platforms/facebook";
import { instagramAdapter } from "@/lib/platforms/instagram";

type MockJob = {
  data: PublishJobData;
  attemptsMade?: number;
  opts?: { attempts?: number };
};

type ProcessorFn = (job: MockJob) => Promise<void>;
type FailedHandlerFn = (
  job: MockJob | undefined,
  error: Error
) => Promise<void>;

const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockPostUpdate = prisma.post.update as jest.Mock;
const mockAccountFindUnique = prisma.socialAccount.findUnique as jest.Mock;
const mockResultUpdate = prisma.publishResult.update as jest.Mock;
const mockResultFindMany = prisma.publishResult.findMany as jest.Mock;
const mockGetToken = getTokenWithRefresh as jest.Mock;
const mockFbPublish = facebookAdapter.publish as jest.Mock;
const mockIgPublish = instagramAdapter.publish as jest.Mock;

const POST_ID = "clh3ck8zp0000qr5hyvxckahk";
const ACCOUNT_ID = "clh3ck8zp0001qr5hyvxckahk";
const RESULT_ID = "clh3ck8zp0002qr5hyvxckahk";
const TOKEN = "decrypted-token";

const BASE_POST = {
  id: POST_ID,
  content: "Hello world",
  mediaType: "NONE",
  mediaUrls: [],
  scheduledAt: null,
  status: "PUBLISHING",
};

const FB_ACCOUNT = {
  id: ACCOUNT_ID,
  platform: "FACEBOOK",
  platformAccountId: "fb-page-123",
  encryptedToken: "enc:token",
  tokenExpiresAt: null,
  isActive: true,
};

const JOB_DATA: PublishJobData = {
  postId: POST_ID,
  accountId: ACCOUNT_ID,
  publishResultId: RESULT_ID,
};

// ── backoffDelay ─────────────────────────────────────────────────────────────

describe("backoffDelay", () => {
  it("returns 2000ms for attempt 1", () => {
    expect(backoffDelay(1)).toBe(2000);
  });

  it("returns 4000ms for attempt 2", () => {
    expect(backoffDelay(2)).toBe(4000);
  });

  it("returns 8000ms for attempt 3", () => {
    expect(backoffDelay(3)).toBe(8000);
  });
});

// ── createPublishWorker ───────────────────────────────────────────────────────

describe("createPublishWorker", () => {
  let processor: ProcessorFn;
  let capturedHandlers: Map<string, FailedHandlerFn | ((e: Error) => void)>;

  beforeEach(() => {
    capturedHandlers = new Map();
    const mockOn = jest.fn(
      (
        event: string,
        handler: FailedHandlerFn | ((e: Error) => void)
      ) => {
        capturedHandlers.set(event, handler);
      }
    );

    (Worker as jest.Mock).mockImplementation(
      (_name: string, proc: ProcessorFn) => {
        processor = proc;
        return { on: mockOn };
      }
    );

    createPublishWorker();
  });

  // ── processor: error cases ──────────────────────────────────────────────────

  describe("processPublishJob — error cases", () => {
    it("throws when post is not found", async () => {
      mockPostFindUnique.mockResolvedValueOnce(null);

      await expect(processor({ data: JOB_DATA })).rejects.toThrow(
        `Post not found: ${POST_ID}`
      );
    });

    it("throws when social account is not found", async () => {
      mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
      mockAccountFindUnique.mockResolvedValueOnce(null);

      await expect(processor({ data: JOB_DATA })).rejects.toThrow(
        `Social account not found or inactive: ${ACCOUNT_ID}`
      );
    });

    it("throws when social account is inactive", async () => {
      mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
      mockAccountFindUnique.mockResolvedValueOnce({
        ...FB_ACCOUNT,
        isActive: false,
      });

      await expect(processor({ data: JOB_DATA })).rejects.toThrow(
        `Social account not found or inactive: ${ACCOUNT_ID}`
      );
    });
  });

  // ── processor: happy path ───────────────────────────────────────────────────

  describe("processPublishJob — happy path", () => {
    it("marks result PROCESSING, publishes, then marks PUBLISHED", async () => {
      mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
      mockAccountFindUnique.mockResolvedValueOnce(FB_ACCOUNT);
      mockResultUpdate.mockResolvedValue({ id: RESULT_ID });
      mockGetToken.mockResolvedValueOnce(TOKEN);
      mockFbPublish.mockResolvedValueOnce({
        platformPostId: "fb-123",
        publishedUrl: "https://facebook.com/fb-123",
        publishedAt: new Date("2024-01-01"),
      });
      mockResultFindMany.mockResolvedValueOnce([{ status: "PUBLISHED" }]);
      mockPostUpdate.mockResolvedValueOnce({});

      await processor({ data: JOB_DATA });

      expect(mockResultUpdate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: { status: "PROCESSING" } })
      );
      expect(mockResultUpdate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PUBLISHED",
            platformPostId: "fb-123",
            publishedUrl: "https://facebook.com/fb-123",
          }),
        })
      );
    });

    it("calls the adapter with platformAccountId and decrypted token", async () => {
      mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
      mockAccountFindUnique.mockResolvedValueOnce(FB_ACCOUNT);
      mockResultUpdate.mockResolvedValue({});
      mockGetToken.mockResolvedValueOnce(TOKEN);
      mockFbPublish.mockResolvedValueOnce({
        platformPostId: "fb-456",
        publishedAt: new Date(),
      });
      mockResultFindMany.mockResolvedValueOnce([{ status: "PUBLISHED" }]);
      mockPostUpdate.mockResolvedValueOnce({});

      await processor({ data: JOB_DATA });

      expect(mockFbPublish).toHaveBeenCalledWith(
        expect.objectContaining({ content: "Hello world" }),
        "fb-page-123",
        TOKEN
      );
    });

    it("uses instagramAdapter for INSTAGRAM platform accounts", async () => {
      const igAccount = {
        ...FB_ACCOUNT,
        platform: "INSTAGRAM",
        platformAccountId: "ig-page-456",
      };

      mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
      mockAccountFindUnique.mockResolvedValueOnce(igAccount);
      mockResultUpdate.mockResolvedValue({});
      mockGetToken.mockResolvedValueOnce(TOKEN);
      mockIgPublish.mockResolvedValueOnce({
        platformPostId: "ig-post-123",
        publishedAt: new Date(),
      });
      mockResultFindMany.mockResolvedValueOnce([{ status: "PUBLISHED" }]);
      mockPostUpdate.mockResolvedValueOnce({});

      await processor({ data: JOB_DATA });

      expect(mockIgPublish).toHaveBeenCalledWith(
        expect.anything(),
        "ig-page-456",
        TOKEN
      );
      expect(mockFbPublish).not.toHaveBeenCalled();
    });

    it("calls getTokenWithRefresh with account token fields", async () => {
      const expiresAt = new Date(Date.now() + 86_400_000);
      mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
      mockAccountFindUnique.mockResolvedValueOnce({
        ...FB_ACCOUNT,
        tokenExpiresAt: expiresAt,
      });
      mockResultUpdate.mockResolvedValue({});
      mockGetToken.mockResolvedValueOnce(TOKEN);
      mockFbPublish.mockResolvedValueOnce({
        platformPostId: "p1",
        publishedAt: new Date(),
      });
      mockResultFindMany.mockResolvedValueOnce([{ status: "PUBLISHED" }]);
      mockPostUpdate.mockResolvedValueOnce({});

      await processor({ data: JOB_DATA });

      expect(mockGetToken).toHaveBeenCalledWith({
        id: ACCOUNT_ID,
        encryptedToken: "enc:token",
        tokenExpiresAt: expiresAt,
      });
    });
  });

  // ── reconcilePostStatus ─────────────────────────────────────────────────────

  describe("reconcilePostStatus (via processPublishJob)", () => {
    function setupForReconcile(statuses: string[]) {
      mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
      mockAccountFindUnique.mockResolvedValueOnce(FB_ACCOUNT);
      mockResultUpdate.mockResolvedValue({});
      mockGetToken.mockResolvedValueOnce(TOKEN);
      mockFbPublish.mockResolvedValueOnce({
        platformPostId: "p1",
        publishedAt: new Date(),
      });
      mockResultFindMany.mockResolvedValueOnce(
        statuses.map((s) => ({ status: s }))
      );
      mockPostUpdate.mockResolvedValueOnce({});
    }

    it("sets post to PUBLISHED when all results are PUBLISHED", async () => {
      setupForReconcile(["PUBLISHED", "PUBLISHED"]);
      await processor({ data: JOB_DATA });

      expect(mockPostUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "PUBLISHED" } })
      );
    });

    it("sets post to FAILED when all results are FAILED", async () => {
      setupForReconcile(["FAILED", "FAILED"]);
      await processor({ data: JOB_DATA });

      expect(mockPostUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "FAILED" } })
      );
    });

    it("sets post to PARTIALLY_PUBLISHED when results are mixed", async () => {
      setupForReconcile(["PUBLISHED", "FAILED"]);
      await processor({ data: JOB_DATA });

      expect(mockPostUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "PARTIALLY_PUBLISHED" } })
      );
    });

    it("does not update post when some results are still pending", async () => {
      mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
      mockAccountFindUnique.mockResolvedValueOnce(FB_ACCOUNT);
      mockResultUpdate.mockResolvedValue({});
      mockGetToken.mockResolvedValueOnce(TOKEN);
      mockFbPublish.mockResolvedValueOnce({
        platformPostId: "p1",
        publishedAt: new Date(),
      });
      // One result still PENDING — not all done
      mockResultFindMany.mockResolvedValueOnce([
        { status: "PUBLISHED" },
        { status: "PENDING" },
      ]);

      await processor({ data: JOB_DATA });

      expect(mockPostUpdate).not.toHaveBeenCalled();
    });
  });

  // ── failed event handler ────────────────────────────────────────────────────

  describe("failed event handler", () => {
    it("updates retryCount when retries remain", async () => {
      const failedHandler = capturedHandlers.get("failed") as FailedHandlerFn;
      mockResultUpdate.mockResolvedValue({});

      await failedHandler(
        { data: JOB_DATA, attemptsMade: 1, opts: { attempts: 3 } },
        new Error("transient error")
      );

      expect(mockResultUpdate).toHaveBeenCalledTimes(1);
      expect(mockResultUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { retryCount: 1 } })
      );
      // Should NOT mark as FAILED yet
      expect(mockResultUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        })
      );
    });

    it("marks result FAILED and reconciles post after all retries exhausted", async () => {
      const failedHandler = capturedHandlers.get("failed") as FailedHandlerFn;
      mockResultUpdate.mockResolvedValue({});
      mockResultFindMany.mockResolvedValueOnce([{ status: "FAILED" }]);
      mockPostUpdate.mockResolvedValueOnce({});

      await failedHandler(
        { data: JOB_DATA, attemptsMade: 3, opts: { attempts: 3 } },
        new Error("permanent failure")
      );

      expect(mockResultUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
            error: "permanent failure",
            retryCount: 3,
          }),
        })
      );
      // reconcilePostStatus should have been called (updates the post)
      expect(mockPostUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "FAILED" } })
      );
    });

    it("does nothing when job is undefined", async () => {
      const failedHandler = capturedHandlers.get("failed") as FailedHandlerFn;

      await failedHandler(undefined, new Error("unknown"));

      expect(mockResultUpdate).not.toHaveBeenCalled();
    });
  });
});
