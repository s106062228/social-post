import { createHmac } from "crypto";

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  webhookLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  PublishStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PUBLISHED: "PUBLISHED",
    FAILED: "FAILED",
  },
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

jest.mock("@/lib/db", () => ({
  prisma: {
    publishResult: {
      updateMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/webhooks/meta/route";
import { prisma } from "@/lib/db";

const mockResultUpdateMany = prisma.publishResult.updateMany as jest.Mock;

const APP_SECRET = "test-app-secret-1234";
const VERIFY_TOKEN = "test-verify-token";

function makeHubSignature(body: string, secret = APP_SECRET): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(body);
  return `sha256=${hmac.digest("hex")}`;
}

function makeGetRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/webhooks/meta");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

function makePostRequest(body: unknown, signature?: string): NextRequest {
  const rawBody = JSON.stringify(body);
  return new NextRequest("http://localhost:3000/api/webhooks/meta", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature !== undefined && { "x-hub-signature-256": signature }),
    },
    body: rawBody,
  });
}

describe("GET /api/webhooks/meta — hub challenge verification", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 500 when META_WEBHOOK_VERIFY_TOKEN is not configured", async () => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;

    const res = await GET(
      makeGetRequest({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "ch_123" })
    );
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Webhook verification token not configured");
  });

  it("returns 200 with the challenge when mode=subscribe and token matches", async () => {
    const res = await GET(
      makeGetRequest({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "abc123" })
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe("abc123");
  });

  it("returns 403 when verify_token does not match", async () => {
    const res = await GET(
      makeGetRequest({ "hub.mode": "subscribe", "hub.verify_token": "wrong-token", "hub.challenge": "abc123" })
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when mode is not subscribe", async () => {
    const res = await GET(
      makeGetRequest({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "abc123" })
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when hub.challenge is missing but mode and token are correct", async () => {
    // Without challenge, the response body is empty string — still 200
    const res = await GET(
      makeGetRequest({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN })
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe("");
  });
});

describe("POST /api/webhooks/meta — event processing", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, META_APP_SECRET: APP_SECRET };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  // ── Signature verification ────────────────────────────────────────────────

  it("returns 401 when x-hub-signature-256 header is missing", async () => {
    const payload = { object: "instagram", entry: [] };
    const res = await makePostRequest(payload); // no signature
    const response = await POST(res);
    expect(response.status).toBe(401);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Invalid signature");
  });

  it("returns 401 when HMAC signature is incorrect", async () => {
    const payload = { object: "instagram", entry: [] };
    const response = await POST(makePostRequest(payload, "sha256=badhash"));
    expect(response.status).toBe(401);
  });

  it("returns 401 when META_APP_SECRET is not set", async () => {
    delete process.env.META_APP_SECRET;

    const payload = { object: "instagram", entry: [] };
    const body = JSON.stringify(payload);
    const sig = makeHubSignature(body);
    const response = await POST(makePostRequest(payload, sig));
    expect(response.status).toBe(401);
  });

  // ── Payload validation ────────────────────────────────────────────────────

  it("returns 400 for unrecognised payload shape (missing object field)", async () => {
    const payload = { entry: [] };
    const body = JSON.stringify(payload);
    const sig = makeHubSignature(body);
    const response = await POST(makePostRequest(payload, sig));
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Unrecognised payload shape");
  });

  // ── Instagram PUBLISHED status update ────────────────────────────────────

  it("updates publishResult to PUBLISHED on instagram media_publish_status PUBLISHED", async () => {
    mockResultUpdateMany.mockResolvedValue({ count: 1 });

    const payload = {
      object: "instagram",
      entry: [
        {
          id: "123",
          changes: [
            {
              field: "media_publish_status",
              value: {
                media_id: "ig-media-456",
                status: "PUBLISHED",
                published: true,
              },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const sig = makeHubSignature(body);
    const response = await POST(makePostRequest(payload, sig));

    expect(response.status).toBe(200);
    const data = (await response.json()) as { received: boolean };
    expect(data.received).toBe(true);
    expect(mockResultUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platformPostId: "ig-media-456" },
        data: expect.objectContaining({ status: "PUBLISHED" }),
      })
    );
  });

  it("updates publishResult to PUBLISHED on FINISHED status", async () => {
    mockResultUpdateMany.mockResolvedValue({ count: 1 });

    const payload = {
      object: "threads",
      entry: [
        {
          id: "999",
          changes: [
            {
              field: "media_publish_status",
              value: { post_id: "threads-post-789", status: "FINISHED" },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const sig = makeHubSignature(body);
    const response = await POST(makePostRequest(payload, sig));

    expect(response.status).toBe(200);
    expect(mockResultUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platformPostId: "threads-post-789" },
        data: expect.objectContaining({ status: "PUBLISHED" }),
      })
    );
  });

  // ── Instagram ERROR status update ─────────────────────────────────────────

  it("updates publishResult to FAILED on instagram media_publish_status ERROR", async () => {
    mockResultUpdateMany.mockResolvedValue({ count: 1 });

    const payload = {
      object: "instagram",
      entry: [
        {
          id: "456",
          changes: [
            {
              field: "media_publish_status",
              value: {
                media_id: "ig-media-bad",
                status: "ERROR",
                error: { code: 1234, message: "Permission denied", subcode: 567 },
              },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const sig = makeHubSignature(body);
    const response = await POST(makePostRequest(payload, sig));

    expect(response.status).toBe(200);
    expect(mockResultUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platformPostId: "ig-media-bad" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining("Permission denied"),
        }),
      })
    );
  });

  it("updates publishResult to FAILED on EXPIRED status with fallback error message", async () => {
    mockResultUpdateMany.mockResolvedValue({ count: 1 });

    const payload = {
      object: "instagram",
      entry: [
        {
          id: "789",
          changes: [
            {
              field: "media_publish_status",
              value: { media_id: "ig-media-expired", status: "EXPIRED" },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const sig = makeHubSignature(body);
    const response = await POST(makePostRequest(payload, sig));

    expect(response.status).toBe(200);
    expect(mockResultUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          error: "Media status: EXPIRED",
        }),
      })
    );
  });

  // ── Facebook page/feed event ──────────────────────────────────────────────

  it("returns 200 without DB update for page/feed events (informational only)", async () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "page-123",
          changes: [
            { field: "feed", value: { item: "status", verb: "add", post_id: "page-123_post-456" } },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const sig = makeHubSignature(body);
    const response = await POST(makePostRequest(payload, sig));

    expect(response.status).toBe(200);
    const data = (await response.json()) as { received: boolean };
    expect(data.received).toBe(true);
    // No DB updates for page feed events
    expect(mockResultUpdateMany).not.toHaveBeenCalled();
  });

  // ── Unrecognised field / object combinations ──────────────────────────────

  it("returns 200 without DB update for unknown object type", async () => {
    const payload = {
      object: "user",
      entry: [
        { id: "user-1", changes: [{ field: "some_field", value: {} }] },
      ],
    };
    const body = JSON.stringify(payload);
    const sig = makeHubSignature(body);
    const response = await POST(makePostRequest(payload, sig));

    expect(response.status).toBe(200);
    expect(mockResultUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 200 without DB update for entries with no changes array", async () => {
    const payload = {
      object: "instagram",
      entry: [{ id: "entry-no-changes" }],
    };
    const body = JSON.stringify(payload);
    const sig = makeHubSignature(body);
    const response = await POST(makePostRequest(payload, sig));

    expect(response.status).toBe(200);
    expect(mockResultUpdateMany).not.toHaveBeenCalled();
  });

  // ── IN_PROGRESS status ────────────────────────────────────────────────────

  it("does not update publishResult for IN_PROGRESS status (no-op)", async () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "evt-1",
          changes: [
            {
              field: "media_publish_status",
              value: { media_id: "ig-media-inprogress", status: "IN_PROGRESS" },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const sig = makeHubSignature(body);
    const response = await POST(makePostRequest(payload, sig));

    expect(response.status).toBe(200);
    expect(mockResultUpdateMany).not.toHaveBeenCalled();
  });
});
