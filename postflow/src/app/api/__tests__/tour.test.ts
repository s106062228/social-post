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
    tourProgress: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/tour/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { TOTAL_TOUR_STEPS } from "@/lib/tour";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindUnique = prisma.tourProgress.findUnique as jest.Mock;
const mockUpsert = prisma.tourProgress.upsert as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeGetRequest() {
  return new NextRequest("http://localhost:3000/api/tour");
}

function makePatchRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/tour", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── GET /api/tour ─────────────────────────────────────────────────────────────

describe("GET /api/tour", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it("returns defaults for a new user with no TourProgress row", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      completedSteps: string[];
      dismissed: boolean;
      totalSteps: number;
    };
    expect(data.completedSteps).toEqual([]);
    expect(data.dismissed).toBe(false);
    expect(data.totalSteps).toBe(TOTAL_TOUR_STEPS);
  });

  it("returns stored progress when TourProgress row exists", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({
      completedSteps: ["dashboard", "posts"],
      dismissed: false,
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      completedSteps: string[];
      dismissed: boolean;
      totalSteps: number;
    };
    expect(data.completedSteps).toEqual(["dashboard", "posts"]);
    expect(data.dismissed).toBe(false);
    expect(data.totalSteps).toBe(TOTAL_TOUR_STEPS);
  });

  it("returns dismissed=true when tour was dismissed", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({
      completedSteps: ["dashboard"],
      dismissed: true,
    });

    const res = await GET(makeGetRequest());
    const data = (await res.json()) as { dismissed: boolean };
    expect(data.dismissed).toBe(true);
  });
});

// ── PATCH /api/tour ───────────────────────────────────────────────────────────

describe("PATCH /api/tour", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await PATCH(makePatchRequest({ completedStep: "dashboard" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await PATCH(makePatchRequest({ completedStep: "dashboard" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await PATCH(makePatchRequest({ completedStep: 123 }));
    expect(res.status).toBe(400);
  });

  it("appends a new step to completedSteps", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ completedSteps: ["dashboard"], dismissed: false });
    mockUpsert.mockResolvedValueOnce({
      completedSteps: ["dashboard", "posts"],
      dismissed: false,
    });

    const res = await PATCH(makePatchRequest({ completedStep: "posts" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { completedSteps: string[] };
    expect(data.completedSteps).toEqual(["dashboard", "posts"]);
  });

  it("does not duplicate a step already in completedSteps", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ completedSteps: ["dashboard"], dismissed: false });
    mockUpsert.mockResolvedValueOnce({
      completedSteps: ["dashboard"],
      dismissed: false,
    });

    await PATCH(makePatchRequest({ completedStep: "dashboard" }));

    const upsertCall = mockUpsert.mock.calls[0][0] as {
      update: { completedSteps: string[] };
    };
    expect(upsertCall.update.completedSteps).toEqual(["dashboard"]);
  });

  it("sets dismissed=true when dismiss flag is sent", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ completedSteps: [], dismissed: false });
    mockUpsert.mockResolvedValueOnce({
      completedSteps: [],
      dismissed: true,
    });

    const res = await PATCH(makePatchRequest({ dismissed: true }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { dismissed: boolean };
    expect(data.dismissed).toBe(true);
  });

  it("returns totalSteps in the response", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce({ completedSteps: [], dismissed: false });
    mockUpsert.mockResolvedValueOnce({ completedSteps: [], dismissed: false });

    const res = await PATCH(makePatchRequest({}));
    const data = (await res.json()) as { totalSteps: number };
    expect(data.totalSteps).toBe(TOTAL_TOUR_STEPS);
  });

  it("handles first-time upsert when no existing row", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFindUnique.mockResolvedValueOnce(null);
    mockUpsert.mockResolvedValueOnce({
      completedSteps: ["dashboard"],
      dismissed: false,
    });

    const res = await PATCH(makePatchRequest({ completedStep: "dashboard" }));
    expect(res.status).toBe(200);

    const createArg = mockUpsert.mock.calls[0][0] as {
      create: { completedSteps: string[] };
    };
    expect(createArg.create.completedSteps).toEqual(["dashboard"]);
  });
});
