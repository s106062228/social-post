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
    dashboardWidget: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { GET, PATCH, WIDGET_KEYS } from "@/app/api/dashboard-widgets/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.dashboardWidget.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

// ── GET /api/dashboard-widgets ─────────────────────────────────────────────────

describe("GET /api/dashboard-widgets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("returns default config when no rows exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { widgets: { widgetKey: string; visible: boolean; position: number; label: string }[] };
    expect(data.widgets).toHaveLength(WIDGET_KEYS.length);
    expect(data.widgets.every((w) => w.visible === true)).toBe(true);
    expect(data.widgets[0].label).toBeTruthy();
  });

  it("returns stored config when rows exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([
      { widgetKey: "kpis", visible: false, position: 0 },
      { widgetKey: "line_chart", visible: true, position: 1 },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { widgets: { widgetKey: string; visible: boolean }[] };
    const kpisWidget = data.widgets.find((w) => w.widgetKey === "kpis");
    expect(kpisWidget?.visible).toBe(false);
    const lineChart = data.widgets.find((w) => w.widgetKey === "line_chart");
    expect(lineChart?.visible).toBe(true);
  });

  it("includes label for every widget", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET();
    const data = (await res.json()) as { widgets: { label: string }[] };
    expect(data.widgets.every((w) => typeof w.label === "string" && w.label.length > 0)).toBe(true);
  });

  it("all widget keys are present in default response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET();
    const data = (await res.json()) as { widgets: { widgetKey: string }[] };
    const keys = data.widgets.map((w) => w.widgetKey);
    for (const key of WIDGET_KEYS) {
      expect(keys).toContain(key);
    }
  });
});

// ── PATCH /api/dashboard-widgets ──────────────────────────────────────────────

describe("PATCH /api/dashboard-widgets", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/dashboard-widgets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest({ widgets: [] }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await PATCH(makeRequest({ widgets: [] }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await PATCH(makeRequest({ widgets: [{ widgetKey: "invalid_key", visible: true, position: 0 }] }));
    expect(res.status).toBe(400);
  });

  it("saves widget config and returns updated list", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    mockTransaction.mockResolvedValueOnce([]);
    mockFindMany.mockResolvedValueOnce([
      { widgetKey: "kpis", visible: false, position: 0 },
      { widgetKey: "line_chart", visible: true, position: 1 },
    ]);

    const res = await PATCH(
      makeRequest({
        widgets: [
          { widgetKey: "kpis", visible: false, position: 0 },
          { widgetKey: "line_chart", visible: true, position: 1 },
        ],
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { widgets: { widgetKey: string; visible: boolean }[] };
    expect(data.widgets).toBeDefined();
    expect(Array.isArray(data.widgets)).toBe(true);
  });

  it("returns correct visible:false after toggling kpis off", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);

    mockTransaction.mockResolvedValueOnce([]);
    mockFindMany.mockResolvedValueOnce(
      WIDGET_KEYS.map((key, i) => ({ widgetKey: key, visible: key !== "kpis", position: i }))
    );

    const res = await PATCH(
      makeRequest({
        widgets: WIDGET_KEYS.map((key, i) => ({
          widgetKey: key,
          visible: key !== "kpis",
          position: i,
        })),
      })
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { widgets: { widgetKey: string; visible: boolean }[] };
    const kpis = data.widgets.find((w) => w.widgetKey === "kpis");
    expect(kpis?.visible).toBe(false);
  });
});
