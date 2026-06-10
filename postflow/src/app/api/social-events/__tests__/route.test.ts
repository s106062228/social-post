// Mock logger before any imports
jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

jest.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/db", () => ({
  prisma: {
    socialEvent: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

jest.mock("@/lib/ai", () => ({
  generateEventContent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { DELETE } from "../[id]/route";
import { POST as POST_EVENT_CONTENT } from "@/app/api/ai/event-content/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { generateEventContent } from "@/lib/ai";

const mockAuth = auth as jest.Mock;
const mockLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.socialEvent.findMany as jest.Mock;
const mockCount = prisma.socialEvent.count as jest.Mock;
const mockCreate = prisma.socialEvent.create as jest.Mock;
const mockFindUnique = prisma.socialEvent.findUnique as jest.Mock;
const mockDelete = prisma.socialEvent.delete as jest.Mock;
const mockGenerateEventContent = generateEventContent as jest.Mock;

const AUTHED_SESSION = { user: { id: "user-1", email: "test@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RATE_LIMIT_EXCEEDED = {
  success: false,
  limit: 100,
  remaining: 0,
  reset: Date.now() + 60000,
};

const globalEvent = {
  id: "event-global-1",
  userId: null,
  title: "New Year's Day",
  description: "First day of the year",
  date: "2026-01-01",
  type: "HOLIDAY" as const,
  platforms: [],
  categories: ["seasonal"],
  isGlobal: true,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
};

const customEvent = {
  id: "event-custom-1",
  userId: "user-1",
  title: "Product Launch Day",
  description: "Launching our new product",
  date: "2026-06-15",
  type: "CUSTOM" as const,
  platforms: ["FACEBOOK", "INSTAGRAM"],
  categories: [],
  isGlobal: false,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

function makeGetReq(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

function makePostReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteReq(url: string): NextRequest {
  return new NextRequest(url, { method: "DELETE" });
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAuth.mockResolvedValue(AUTHED_SESSION as any);
  mockLimiter.mockResolvedValue(RATE_LIMIT_OK);
});

// ── GET /api/social-events ────────────────────────────────────────────────────

describe("GET /api/social-events", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeGetReq("http://localhost/api/social-events"));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeGetReq("http://localhost/api/social-events"));
    expect(res.status).toBe(429);
  });

  it("returns global and user events for current month", async () => {
    mockFindMany.mockResolvedValueOnce([globalEvent, customEvent]);
    const res = await GET(makeGetReq("http://localhost/api/social-events"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { events: typeof globalEvent[] };
    expect(Array.isArray(data.events)).toBe(true);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { isGlobal: true },
            { userId: "user-1" },
          ]),
        }),
      })
    );
  });

  it("filters by month parameter", async () => {
    mockFindMany.mockResolvedValueOnce([globalEvent]);
    const res = await GET(
      makeGetReq("http://localhost/api/social-events?month=2026-01")
    );
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: "2026-01-01", lte: "2026-01-31" },
        }),
      })
    );
  });

  it("filters by type parameter", async () => {
    mockFindMany.mockResolvedValueOnce([globalEvent]);
    const res = await GET(
      makeGetReq("http://localhost/api/social-events?month=2026-01&type=HOLIDAY")
    );
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "HOLIDAY" }),
      })
    );
  });

  it("filters by platform parameter (empty platforms pass through)", async () => {
    // globalEvent has no platforms (empty array) — should be included regardless
    mockFindMany.mockResolvedValueOnce([globalEvent, customEvent]);
    const res = await GET(
      makeGetReq(
        "http://localhost/api/social-events?month=2026-06&platform=FACEBOOK"
      )
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { events: unknown[] };
    // globalEvent (empty platforms) and customEvent (includes FACEBOOK) both pass
    expect(data.events).toHaveLength(2);
  });
});

// ── POST /api/social-events ───────────────────────────────────────────────────

describe("POST /api/social-events", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(
      makePostReq("http://localhost/api/social-events", {
        title: "Test",
        date: "2026-07-04",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST(
      makePostReq("http://localhost/api/social-events", {
        title: "Test",
        date: "2026-07-04",
      })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 for missing title", async () => {
    mockCount.mockResolvedValueOnce(0);
    const res = await POST(
      makePostReq("http://localhost/api/social-events", {
        date: "2026-07-04",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    mockCount.mockResolvedValueOnce(0);
    const res = await POST(
      makePostReq("http://localhost/api/social-events", {
        title: "Test",
        date: "not-a-date",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when max custom events reached", async () => {
    mockCount.mockResolvedValueOnce(100);
    const res = await POST(
      makePostReq("http://localhost/api/social-events", {
        title: "Test",
        date: "2026-07-04",
      })
    );
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Maximum/);
  });

  it("creates custom event successfully", async () => {
    mockCount.mockResolvedValueOnce(5);
    mockCreate.mockResolvedValueOnce(customEvent);
    const res = await POST(
      makePostReq("http://localhost/api/social-events", {
        title: "Product Launch Day",
        date: "2026-06-15",
        type: "CUSTOM",
        description: "Launching our new product",
        platforms: ["FACEBOOK", "INSTAGRAM"],
      })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { event: typeof customEvent };
    expect(data.event.title).toBe("Product Launch Day");
    expect(data.event.isGlobal).toBe(false);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          isGlobal: false,
        }),
      })
    );
  });
});

// ── DELETE /api/social-events/[id] ───────────────────────────────────────────

describe("DELETE /api/social-events/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await DELETE(
      makeDeleteReq("http://localhost/api/social-events/event-custom-1"),
      makeParams("event-custom-1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await DELETE(
      makeDeleteReq("http://localhost/api/social-events/event-custom-1"),
      makeParams("event-custom-1")
    );
    expect(res.status).toBe(429);
  });

  it("returns 404 when event not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await DELETE(
      makeDeleteReq("http://localhost/api/social-events/nonexistent"),
      makeParams("nonexistent")
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when trying to delete a global event", async () => {
    mockFindUnique.mockResolvedValueOnce(globalEvent);
    const res = await DELETE(
      makeDeleteReq("http://localhost/api/social-events/event-global-1"),
      makeParams("event-global-1")
    );
    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/global/i);
  });

  it("returns 403 when trying to delete another user's event", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...customEvent,
      userId: "other-user",
    });
    const res = await DELETE(
      makeDeleteReq("http://localhost/api/social-events/event-custom-1"),
      makeParams("event-custom-1")
    );
    expect(res.status).toBe(403);
  });

  it("returns 204 on successful deletion", async () => {
    mockFindUnique.mockResolvedValueOnce(customEvent);
    mockDelete.mockResolvedValueOnce(customEvent);
    const res = await DELETE(
      makeDeleteReq("http://localhost/api/social-events/event-custom-1"),
      makeParams("event-custom-1")
    );
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({
      where: { id: "event-custom-1" },
    });
  });
});

// ── POST /api/ai/event-content ────────────────────────────────────────────────

describe("POST /api/ai/event-content", () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });

  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST_EVENT_CONTENT(
      makePostReq("http://localhost/api/ai/event-content", {
        title: "World Earth Day",
        platforms: ["FACEBOOK"],
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await POST_EVENT_CONTENT(
      makePostReq("http://localhost/api/ai/event-content", {
        title: "World Earth Day",
        platforms: ["FACEBOOK"],
      })
    );
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST_EVENT_CONTENT(
      makePostReq("http://localhost/api/ai/event-content", {
        title: "World Earth Day",
        platforms: ["FACEBOOK"],
      })
    );
    expect(res.status).toBe(503);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });

  it("returns 400 for missing platforms", async () => {
    const res = await POST_EVENT_CONTENT(
      makePostReq("http://localhost/api/ai/event-content", {
        title: "World Earth Day",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns variants array on success", async () => {
    const mockVariants = [
      "🌍 Happy Earth Day! Let's protect our planet. #EarthDay",
      "Earth Day reminds us to be stewards of our environment. 🌿 #EarthDay2026",
      "Every day is Earth Day! What are you doing to help? 💚 #ClimateAction",
    ];

    mockGenerateEventContent.mockResolvedValueOnce(mockVariants);

    const res = await POST_EVENT_CONTENT(
      makePostReq("http://localhost/api/ai/event-content", {
        title: "World Earth Day",
        description: "Annual environmental awareness day",
        platforms: ["FACEBOOK", "INSTAGRAM", "TWITTER"],
      })
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { variants: string[] };
    expect(Array.isArray(data.variants)).toBe(true);
    expect(data.variants).toHaveLength(3);
    expect(data.variants[0]).toBe(mockVariants[0]);
  });
});
