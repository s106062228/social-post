jest.mock("bullmq", () => ({ Worker: jest.fn() }));

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  workerLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    post: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/notifications", () => ({
  createNotification: jest.fn(),
  NOTIFICATION_TYPES: {
    POST_RECYCLED: "post.recycled",
  },
}));

jest.mock("@/lib/activity-log", () => ({
  logActivity: jest.fn(),
}));

jest.mock("@/lib/queue/connection", () => ({
  createRedisConnection: jest.fn().mockReturnValue({}),
  QUEUE_NAMES: { EVERGREEN_RECYCLE: "postflow:evergreen-recycle" },
}));

import { Worker } from "bullmq";
import {
  createEvergreenRecycleWorker,
  type EvergreenRecycleJobData,
} from "@/lib/queue/workers/evergreen-recycle";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

type MockJob = { data: EvergreenRecycleJobData; id?: string };
type ProcessorFn = (job: MockJob) => Promise<void>;

const mockFindMany = prisma.post.findMany as jest.Mock;
const mockCreate = prisma.post.create as jest.Mock;
const mockUpdate = prisma.post.update as jest.Mock;
const mockCreateNotification = createNotification as jest.Mock;
const mockLogActivity = logActivity as jest.Mock;

const JOB_DATA: EvergreenRecycleJobData = {
  triggeredAt: new Date("2026-05-18T03:00:00Z").toISOString(),
};

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const NEW_POST_ID = "clh3ck8zp0002qr5hyvxckahk";

describe("createEvergreenRecycleWorker", () => {
  let processor: ProcessorFn;

  beforeEach(() => {
    jest.clearAllMocks();

    (Worker as unknown as jest.Mock).mockImplementation(
      (_name: string, proc: ProcessorFn) => {
        processor = proc;
        return { on: jest.fn() };
      }
    );
    createEvergreenRecycleWorker();
  });

  it("skips posts where lastRecycledAt is recent (within interval)", async () => {
    const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    mockFindMany.mockResolvedValueOnce([
      {
        id: MOCK_POST_ID,
        userId: MOCK_USER_ID,
        content: "Evergreen content",
        mediaType: "NONE",
        mediaUrls: [],
        recycleInterval: 7,
        lastRecycledAt: recentDate,
      },
    ]);

    await processor({ data: JOB_DATA });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("recycles posts that have never been recycled (lastRecycledAt is null)", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: MOCK_POST_ID,
        userId: MOCK_USER_ID,
        content: "Evergreen content",
        mediaType: "NONE",
        mediaUrls: [],
        recycleInterval: 7,
        lastRecycledAt: null,
      },
    ]);
    mockCreate.mockResolvedValueOnce({ id: NEW_POST_ID });
    mockUpdate.mockResolvedValueOnce({});

    await processor({ data: JOB_DATA });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_USER_ID,
          content: "Evergreen content",
          mediaType: "NONE",
          status: "DRAFT",
          isEvergreen: true,
          scheduledAt: null,
        }),
      })
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_POST_ID },
        data: expect.objectContaining({ lastRecycledAt: expect.any(Date) }),
      })
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MOCK_USER_ID,
        type: "post.recycled",
        entityId: NEW_POST_ID,
      })
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MOCK_USER_ID,
        action: "post.auto_recycled",
        entityId: NEW_POST_ID,
        metadata: expect.objectContaining({ sourcePostId: MOCK_POST_ID, intervalDays: 7 }),
      })
    );
  });

  it("recycles posts where lastRecycledAt is older than interval", async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    mockFindMany.mockResolvedValueOnce([
      {
        id: MOCK_POST_ID,
        userId: MOCK_USER_ID,
        content: "Old evergreen",
        mediaType: "IMAGE",
        mediaUrls: ["https://example.com/img.jpg"],
        recycleInterval: 7,
        lastRecycledAt: oldDate,
      },
    ]);
    mockCreate.mockResolvedValueOnce({ id: NEW_POST_ID });
    mockUpdate.mockResolvedValueOnce({});

    await processor({ data: JOB_DATA });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "Old evergreen",
          mediaType: "IMAGE",
          mediaUrls: ["https://example.com/img.jpg"],
        }),
      })
    );
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("handles empty post list gracefully", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await processor({ data: JOB_DATA });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("continues processing other posts when one fails", async () => {
    const ANOTHER_POST_ID = "clh3ck8zp0003qr5hyvxckahk";
    const ANOTHER_NEW_ID = "clh3ck8zp0004qr5hyvxckahk";
    mockFindMany.mockResolvedValueOnce([
      {
        id: MOCK_POST_ID,
        userId: MOCK_USER_ID,
        content: "First post",
        mediaType: "NONE",
        mediaUrls: [],
        recycleInterval: 7,
        lastRecycledAt: null,
      },
      {
        id: ANOTHER_POST_ID,
        userId: MOCK_USER_ID,
        content: "Second post",
        mediaType: "NONE",
        mediaUrls: [],
        recycleInterval: 7,
        lastRecycledAt: null,
      },
    ]);
    // First create fails, second succeeds
    mockCreate
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ id: ANOTHER_NEW_ID });
    mockUpdate.mockResolvedValue({});

    await processor({ data: JOB_DATA });

    // Should still process the second post
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("queries only evergreen PUBLISHED posts with recycleInterval set", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await processor({ data: JOB_DATA });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isEvergreen: true,
          status: "PUBLISHED",
          recycleInterval: { not: null },
          archivedAt: null,
        }),
      })
    );
  });
});
