jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
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

import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/webhooks/meta/route";
import { prisma } from "@/lib/db";

const mockUpdateMany = prisma.publishResult.updateMany as jest.Mock;

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";

function makeSignature(body: string, secret = APP_SECRET): string {
  const hmac = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hmac}`;
}

function makeGetRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/webhooks/meta");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

function makePostRequest(body: unknown, signature?: string): NextRequest {
  const bodyStr = JSON.stringify(body);
  const sig = signature ?? makeSignature(bodyStr);
  return new NextRequest("http://localhost:3000/api/webhooks/meta", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": sig,
    },
    body: bodyStr,
  });
}

describe("GET /api/webhooks/meta — hub challenge verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
    process.env.META_APP_SECRET = APP_SECRET;
  });

  afterEach(() => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    delete process.env.META_APP_SECRET;
  });

  it("returns 200 with challenge when mode=subscribe and token matches", async () => {
    const res = await GET(
      makeGetRequest({
        "hub.mode": "subscribe",
        "hub.verify_token": VERIFY_TOKEN,
        "hub.challenge": "abc123",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe("abc123");
  });

  it("returns 403 when verify token does not match", async () => {
    const res = await GET(
      makeGetRequest({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "abc123",
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when mode is not subscribe", async () => {
    const res = await GET(
      makeGetRequest({
        "hub.mode": "unsubscribe",
        "hub.verify_token": VERIFY_TOKEN,
        "hub.challenge": "abc123",
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 500 when META_WEBHOOK_VERIFY_TOKEN is not configured", async () => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    const res = await GET(
      makeGetRequest({
        "hub.mode": "subscribe",
        "hub.verify_token": VERIFY_TOKEN,
        "hub.challenge": "abc123",
      })
    );
    expect(res.status).toBe(500);
  });
});

describe("POST /api/webhooks/meta — webhook event handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.META_APP_SECRET = APP_SECRET;
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    delete process.env.META_APP_SECRET;
  });

  it("returns 401 when signature is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/webhooks/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object: "page", entry: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when signature is invalid", async () => {
    const body = JSON.stringify({ object: "page", entry: [] });
    const req = new NextRequest("http://localhost:3000/api/webhooks/meta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": "sha256=invalidsignature",
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON payload", async () => {
    const rawBody = "not-json";
    const sig = makeSignature(rawBody);
    const req = new NextRequest("http://localhost:3000/api/webhooks/meta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": sig,
      },
      body: rawBody,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unrecognised payload shape", async () => {
    const res = await POST(makePostRequest({ unexpected: "shape" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 for valid payload with no changes (pass-through)", async () => {
    const payload = { object: "page", entry: [{ id: "123", time: 1234567890 }] };
    const res = await POST(makePostRequest(payload));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { received: boolean };
    expect(data.received).toBe(true);
  });

  it("updates PublishResult to PUBLISHED on media PUBLISHED status", async () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              field: "media_publish_status",
              value: { media_id: "media-123", status: "PUBLISHED" },
            },
          ],
        },
      ],
    };

    const res = await POST(makePostRequest(payload));
    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platformPostId: "media-123" },
        data: expect.objectContaining({ status: "PUBLISHED" }),
      })
    );
  });

  it("updates PublishResult to FAILED on media ERROR status", async () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              field: "media_publish_status",
              value: {
                media_id: "media-456",
                status: "ERROR",
                error: { code: 100, message: "Invalid media" },
              },
            },
          ],
        },
      ],
    };

    const res = await POST(makePostRequest(payload));
    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platformPostId: "media-456" },
        data: expect.objectContaining({ status: "FAILED" }),
      })
    );
  });

  it("updates PublishResult to PUBLISHED on Threads FINISHED status", async () => {
    const payload = {
      object: "threads",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              field: "media_publish_status",
              value: { post_id: "thread-789", status: "FINISHED" },
            },
          ],
        },
      ],
    };

    const res = await POST(makePostRequest(payload));
    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platformPostId: "thread-789" },
        data: expect.objectContaining({ status: "PUBLISHED" }),
      })
    );
  });

  it("does not call updateMany for page feed events", async () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "page-1",
          changes: [{ field: "feed", value: { item: "post" } }],
        },
      ],
    };

    const res = await POST(makePostRequest(payload));
    expect(res.status).toBe(200);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
