jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
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
    calendarToken: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/ical", () => ({
  generateICalFeed: jest.fn().mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR"),
}));

import { NextRequest } from "next/server";
import { GET as exportGET } from "@/app/api/calendar/export/route";
import { GET as tokenGET, DELETE as tokenDELETE } from "@/app/api/calendar/token/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { generateICalFeed } from "@/lib/ical";

const mockAuth = auth as jest.Mock;
const mockCalendarTokenFindUnique = prisma.calendarToken.findUnique as jest.Mock;
const mockCalendarTokenUpsert = prisma.calendarToken.upsert as jest.Mock;
const mockCalendarTokenDeleteMany = prisma.calendarToken.deleteMany as jest.Mock;
const mockCalendarTokenCreate = prisma.calendarToken.create as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateICalFeed = generateICalFeed as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };
const SAMPLE_TOKEN = "cld-sample-token-abc123";

const SAMPLE_POSTS = [
  {
    id: "post-1",
    content: "Hello world! #socialmedia",
    scheduledAt: new Date("2026-05-01T10:00:00Z"),
    status: "SCHEDULED",
  },
  {
    id: "post-2",
    content: "Published post content",
    scheduledAt: new Date("2026-04-20T09:00:00Z"),
    status: "PUBLISHED",
  },
];

function makeExportRequest(url = "http://localhost/api/calendar/export"): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPostFindMany.mockResolvedValue(SAMPLE_POSTS);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
});

// ── /api/calendar/export ──────────────────────────────────────────────────────

describe("GET /api/calendar/export", () => {
  it("returns 401 when not authenticated and no token provided", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await exportGET(makeExportRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid ?token= query param", async () => {
    mockAuth.mockResolvedValue(null);
    mockCalendarTokenFindUnique.mockResolvedValue(null);
    const res = await exportGET(
      makeExportRequest("http://localhost/api/calendar/export?token=bad-token")
    );
    expect(res.status).toBe(401);
  });

  it("authenticates via session and returns iCal feed", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    const res = await exportGET(makeExportRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    expect(res.headers.get("Content-Disposition")).toContain(".ics");
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: MOCK_USER_ID }) })
    );
  });

  it("authenticates via valid ?token= query param", async () => {
    mockAuth.mockResolvedValue(null);
    mockCalendarTokenFindUnique.mockResolvedValue({ userId: MOCK_USER_ID });
    const res = await exportGET(
      makeExportRequest(`http://localhost/api/calendar/export?token=${SAMPLE_TOKEN}`)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    expect(mockCalendarTokenFindUnique).toHaveBeenCalledWith({
      where: { token: SAMPLE_TOKEN },
      select: { userId: true },
    });
  });

  it("calls generateICalFeed with fetched posts", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    await exportGET(makeExportRequest());
    expect(mockGenerateICalFeed).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "post-1" }),
        expect.objectContaining({ id: "post-2" }),
      ]),
      expect.any(String)
    );
  });

  it("returns iCal body from generateICalFeed", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockGenerateICalFeed.mockReturnValue("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR");
    const res = await exportGET(makeExportRequest());
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
  });

  it("returns empty calendar when user has no scheduled posts", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindMany.mockResolvedValue([]);
    mockGenerateICalFeed.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR");
    const res = await exportGET(makeExportRequest());
    expect(res.status).toBe(200);
    expect(mockGenerateICalFeed).toHaveBeenCalledWith([], expect.any(String));
  });
});

// ── /api/calendar/token GET ───────────────────────────────────────────────────

describe("GET /api/calendar/token", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await tokenGET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await tokenGET();
    expect(res.status).toBe(429);
  });

  it("upserts and returns the token", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockCalendarTokenUpsert.mockResolvedValue({ token: SAMPLE_TOKEN, createdAt: new Date() });
    const res = await tokenGET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe(SAMPLE_TOKEN);
    expect(mockCalendarTokenUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });
});

// ── /api/calendar/token DELETE ────────────────────────────────────────────────

describe("DELETE /api/calendar/token", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await tokenDELETE();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await tokenDELETE();
    expect(res.status).toBe(429);
  });

  it("deletes old token and creates a new one", async () => {
    const NEW_TOKEN = "new-regenerated-token-xyz";
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockCalendarTokenDeleteMany.mockResolvedValue({ count: 1 });
    mockCalendarTokenCreate.mockResolvedValue({ token: NEW_TOKEN, createdAt: new Date() });
    const res = await tokenDELETE();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe(NEW_TOKEN);
    expect(mockCalendarTokenDeleteMany).toHaveBeenCalledWith({ where: { userId: MOCK_USER_ID } });
    expect(mockCalendarTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: MOCK_USER_ID } })
    );
  });
});
