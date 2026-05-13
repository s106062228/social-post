jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
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

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    pushSubscription: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock("web-push", () => ({
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { GET as getVapidKey } from "@/app/api/push/vapid-key/route";
import { POST as subscribe, DELETE as unsubscribe } from "@/app/api/push/subscribe/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockUpsert = prisma.pushSubscription.upsert as jest.Mock;
const mockDeleteMany = prisma.pushSubscription.deleteMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const VALID_SUBSCRIPTION = {
  endpoint: "https://push.example.com/endpoint/abc123",
  p256dhKey: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlqHgx5j9lbCEZM_tJxz",
  authKey: "tBHItJI5svbpez7KI4CCXg",
};

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_EMAIL;
});

describe("GET /api/push/vapid-key", () => {
  it("returns enabled=false when VAPID not configured", async () => {
    const res = await getVapidKey();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.enabled).toBe(false);
    expect(data.publicKey).toBeNull();
  });

  it("returns enabled=true with publicKey when VAPID configured", async () => {
    process.env.VAPID_PUBLIC_KEY = "BTestPublicKey";
    const res = await getVapidKey();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.enabled).toBe(true);
    expect(data.publicKey).toBe("BTestPublicKey");
  });
});

describe("POST /api/push/subscribe", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = makeRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(VALID_SUBSCRIPTION),
    });
    const res = await subscribe(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const req = makeRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(VALID_SUBSCRIPTION),
    });
    const res = await subscribe(req);
    expect(res.status).toBe(429);
  });

  it("returns 422 for invalid body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const req = makeRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: "not-a-url", p256dhKey: "", authKey: "" }),
    });
    const res = await subscribe(req);
    expect(res.status).toBe(422);
  });

  it("upserts subscription and returns success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUpsert.mockResolvedValueOnce({ id: "sub1", ...VALID_SUBSCRIPTION });
    const req = makeRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(VALID_SUBSCRIPTION),
    });
    const res = await subscribe(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: VALID_SUBSCRIPTION.endpoint },
        create: expect.objectContaining({ userId: MOCK_USER_ID }),
      })
    );
  });

  it("includes optional userAgent when provided", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUpsert.mockResolvedValueOnce({});
    const req = makeRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ ...VALID_SUBSCRIPTION, userAgent: "Mozilla/5.0" }),
    });
    await subscribe(req);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userAgent: "Mozilla/5.0" }),
      })
    );
  });
});

describe("DELETE /api/push/subscribe", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = makeRequest("http://localhost/api/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: VALID_SUBSCRIPTION.endpoint }),
    });
    const res = await unsubscribe(req);
    expect(res.status).toBe(401);
  });

  it("returns 422 for invalid body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    const req = makeRequest("http://localhost/api/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: "not-a-url" }),
    });
    const res = await unsubscribe(req);
    expect(res.status).toBe(422);
  });

  it("removes subscription and returns success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockDeleteMany.mockResolvedValueOnce({ count: 1 });
    const req = makeRequest("http://localhost/api/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: VALID_SUBSCRIPTION.endpoint }),
    });
    const res = await unsubscribe(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: MOCK_USER_ID, endpoint: VALID_SUBSCRIPTION.endpoint },
    });
  });

  it("returns success even when subscription does not exist (idempotent)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockDeleteMany.mockResolvedValueOnce({ count: 0 });
    const req = makeRequest("http://localhost/api/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: VALID_SUBSCRIPTION.endpoint }),
    });
    const res = await unsubscribe(req);
    expect(res.status).toBe(200);
  });
});
