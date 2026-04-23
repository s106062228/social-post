// Tests for the webhook dispatch utility.
// We mock fetch and prisma so no network or DB is needed.

jest.mock("@/lib/db", () => ({
  prisma: {
    webhookConfig: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

import { prisma } from "@/lib/db";
import { dispatchWebhooks } from "../webhook-dispatch";
import { logger } from "@/lib/logger";

const mockFindMany = prisma.webhookConfig.findMany as jest.Mock;
const mockLogger = logger as {
  warn: jest.Mock;
  error: jest.Mock;
  info: jest.Mock;
};

const USER_ID = "cluser0001";
const SECRET = "abc123secret";

function makeFetchSpy(status = 200): jest.Mock {
  const spy = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
  });
  global.fetch = spy as unknown as typeof fetch;
  return spy;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── dispatchWebhooks ──────────────────────────────────────────────────────────

describe("dispatchWebhooks", () => {
  it("does nothing when no active configs exist", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const fetchSpy = makeFetchSpy();

    await dispatchWebhooks(USER_ID, "post.published", { postId: "p1" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, isActive: true, events: { has: "post.published" } },
      })
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs to each configured webhook URL", async () => {
    mockFindMany.mockResolvedValueOnce([
      { url: "https://a.example.com/hook", secret: SECRET },
      { url: "https://b.example.com/hook", secret: SECRET },
    ]);
    const fetchSpy = makeFetchSpy(200);

    await dispatchWebhooks(USER_ID, "post.failed", { postId: "p2" });

    // Give the fire-and-forget allSettled time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://a.example.com/hook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-PostFlow-Event": "post.failed",
        }),
      })
    );
  });

  it("includes HMAC signature header", async () => {
    mockFindMany.mockResolvedValueOnce([
      { url: "https://c.example.com/hook", secret: "mysecret" },
    ]);
    const fetchSpy = makeFetchSpy(200);

    await dispatchWebhooks(USER_ID, "post.published", { postId: "p3" });
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = callArgs[1].headers as Record<string, string>;
    expect(headers["X-PostFlow-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("sends JSON payload with event, timestamp, and data", async () => {
    mockFindMany.mockResolvedValueOnce([
      { url: "https://d.example.com/hook", secret: SECRET },
    ]);
    const fetchSpy = makeFetchSpy(200);

    await dispatchWebhooks(USER_ID, "post.partially_published", { postId: "p4" });
    await new Promise((r) => setTimeout(r, 50));

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string) as {
      event: string;
      timestamp: string;
      data: { postId: string };
    };
    expect(body.event).toBe("post.partially_published");
    expect(body.data.postId).toBe("p4");
    expect(typeof body.timestamp).toBe("string");
  });

  it("logs a warning on non-2xx response and does not throw", async () => {
    mockFindMany.mockResolvedValueOnce([
      { url: "https://e.example.com/hook", secret: SECRET },
    ]);
    makeFetchSpy(500);

    await expect(
      dispatchWebhooks(USER_ID, "post.published", { postId: "p5" })
    ).resolves.toBeUndefined();

    await new Promise((r) => setTimeout(r, 50));

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://e.example.com/hook", status: 500 }),
      expect.any(String)
    );
  });

  it("logs an error and does not throw when fetch rejects", async () => {
    mockFindMany.mockResolvedValueOnce([
      { url: "https://f.example.com/hook", secret: SECRET },
    ]);
    global.fetch = jest.fn().mockRejectedValue(new Error("network error")) as unknown as typeof fetch;

    await expect(
      dispatchWebhooks(USER_ID, "post.published", { postId: "p6" })
    ).resolves.toBeUndefined();

    await new Promise((r) => setTimeout(r, 50));

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://f.example.com/hook" }),
      "Webhook delivery failed"
    );
  });

  it("logs an error and returns early when prisma throws", async () => {
    mockFindMany.mockRejectedValueOnce(new Error("db error"));
    const fetchSpy = makeFetchSpy(200);

    await dispatchWebhooks(USER_ID, "post.published", { postId: "p7" });

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, event: "post.published" }),
      "Failed to fetch webhook configs"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
