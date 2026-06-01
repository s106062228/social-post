// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  MediaType: { NONE: "NONE", IMAGE: "IMAGE", VIDEO: "VIDEO", CAROUSEL: "CAROUSEL" },
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
      constructor(msg: string, opts: { code: string }) { super(msg); this.code = opts.code; }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: { post: { create: jest.fn() } },
}));

jest.mock("@/lib/activity-log", () => ({ logActivity: jest.fn() }));

jest.mock("@/lib/sanitize", () => ({
  sanitizePostContent: jest.fn((v: string) => v),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { POST } from "@/app/api/calendar/import/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { parseICS, icsEventsToPostDrafts } from "@/lib/ical-import";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostCreate = prisma.post.create as jest.Mock;

const MOCK_USER_ID = "user-abc123";
const AUTHED = { user: { id: MOCK_USER_ID } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const VALID_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event1@test
SUMMARY:Team Meeting
DESCRIPTION:Weekly sync
DTSTART:20270115T100000Z
DTEND:20270115T110000Z
END:VEVENT
END:VCALENDAR`;

const MULTI_EVENT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:ev1@test
SUMMARY:Event One
DESCRIPTION:First event
DTSTART:20270101T090000Z
DTEND:20270101T100000Z
END:VEVENT
BEGIN:VEVENT
UID:ev2@test
SUMMARY:Event Two
DESCRIPTION:Second event
DTSTART:20270115T140000Z
DTEND:20270115T150000Z
END:VEVENT
END:VCALENDAR`;

const NO_DTSTART_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:nods@test
SUMMARY:No Date Event
DESCRIPTION:Missing start date
END:VEVENT
END:VCALENDAR`;

function makeTextRequest(body: string, contentType = "text/calendar") {
  return new NextRequest("http://localhost:3000/api/calendar/import", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

function makeFormRequest(icsText: string, filename = "test.ics") {
  const formData = new FormData();
  const blob = new Blob([icsText], { type: "text/calendar" });
  const file = new File([blob], filename, { type: "text/calendar" });
  formData.append("file", file);
  return new NextRequest("http://localhost:3000/api/calendar/import", {
    method: "POST",
    body: formData,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/calendar/import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockPostCreate.mockResolvedValue({ id: "new-post-id" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeTextRequest(VALID_ICS));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await POST(makeTextRequest(VALID_ICS));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid ICS content", async () => {
    const res = await POST(makeTextRequest("not an ics file"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid ICS/i);
  });

  it("returns 400 for empty body", async () => {
    const res = await POST(makeTextRequest(""));
    expect(res.status).toBe(400);
  });

  it("returns 0 imported for ICS with no DTSTART events", async () => {
    const res = await POST(makeTextRequest(NO_DTSTART_ICS));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.imported).toBe(0);
    expect(json.skipped.length).toBeGreaterThan(0);
  });

  it("imports a single event successfully", async () => {
    const res = await POST(makeTextRequest(VALID_ICS));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.imported).toBe(1);
    expect(json.postIds).toHaveLength(1);
    expect(mockPostCreate).toHaveBeenCalledTimes(1);
    const createCall = mockPostCreate.mock.calls[0][0];
    expect(createCall.data.content).toContain("Team Meeting");
    expect(createCall.data.status).toBe("DRAFT");
  });

  it("imports multiple events", async () => {
    mockPostCreate.mockResolvedValueOnce({ id: "p1" }).mockResolvedValueOnce({ id: "p2" });
    const res = await POST(makeTextRequest(MULTI_EVENT_ICS));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.imported).toBe(2);
    expect(json.postIds).toHaveLength(2);
  });

  it("sets scheduledAt from DTSTART", async () => {
    const res = await POST(makeTextRequest(VALID_ICS));
    expect(res.status).toBe(200);
    const createCall = mockPostCreate.mock.calls[0][0];
    expect(createCall.data.scheduledAt).toBeInstanceOf(Date);
    expect(createCall.data.scheduledAt.toISOString()).toContain("2027-01-15");
  });

  it("builds content from summary and description", async () => {
    await POST(makeTextRequest(VALID_ICS));
    const createCall = mockPostCreate.mock.calls[0][0];
    expect(createCall.data.content).toContain("Team Meeting");
    expect(createCall.data.content).toContain("Weekly sync");
  });

  it("returns message describing import count", async () => {
    const res = await POST(makeTextRequest(VALID_ICS));
    const json = await res.json();
    expect(json.message).toMatch(/1 event/i);
  });
});

// ── parseICS unit tests ───────────────────────────────────────────────────────

describe("parseICS utility", () => {
  it("returns empty events for empty string", () => {
    const { events, parseErrors } = parseICS("");
    expect(events).toHaveLength(0);
    expect(parseErrors).toHaveLength(0);
  });

  it("parses a single VEVENT", () => {
    const { events } = parseICS(VALID_ICS);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("Team Meeting");
    expect(events[0].description).toBe("Weekly sync");
    expect(events[0].uid).toBe("event1@test");
  });

  it("parses multiple VEVENTs", () => {
    const { events } = parseICS(MULTI_EVENT_ICS);
    expect(events).toHaveLength(2);
    expect(events[0].summary).toBe("Event One");
    expect(events[1].summary).toBe("Event Two");
  });

  it("reports parse error for missing DTSTART", () => {
    const { events, parseErrors } = parseICS(NO_DTSTART_ICS);
    expect(events).toHaveLength(0);
    expect(parseErrors).toHaveLength(1);
    expect(parseErrors[0]).toMatch(/No Date Event/);
  });

  it("parses DATE-only DTSTART (YYYYMMDD)", () => {
    const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:d@t\nSUMMARY:Date Only\nDTSTART:20270301\nEND:VEVENT\nEND:VCALENDAR`;
    const { events } = parseICS(ics);
    expect(events).toHaveLength(1);
    expect(events[0].dtstart).toBeInstanceOf(Date);
    expect(events[0].dtstart!.getFullYear()).toBe(2027);
  });

  it("handles escaped characters in SUMMARY", () => {
    const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:e@t\nSUMMARY:Hello\\, World\nDTSTART:20270301T100000Z\nEND:VEVENT\nEND:VCALENDAR`;
    const { events } = parseICS(ics);
    expect(events[0].summary).toBe("Hello, World");
  });
});

// ── icsEventsToPostDrafts unit tests ─────────────────────────────────────────

describe("icsEventsToPostDrafts utility", () => {
  it("converts events to drafts", () => {
    const { events } = parseICS(VALID_ICS);
    const { drafts } = icsEventsToPostDrafts(events);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].scheduledAt).toBeInstanceOf(Date);
    expect(drafts[0].source).toBe("ics");
  });

  it("skips past events when skipPastEvents=true", () => {
    const pastIcs = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:p@t\nSUMMARY:Past Event\nDTSTART:20200101T100000Z\nEND:VEVENT\nEND:VCALENDAR`;
    const { events } = parseICS(pastIcs);
    const { drafts, skipped } = icsEventsToPostDrafts(events, { skipPastEvents: true });
    expect(drafts).toHaveLength(0);
    expect(skipped.length).toBeGreaterThan(0);
  });

  it("includes past events by default", () => {
    const pastIcs = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:p2@t\nSUMMARY:Past Event\nDTSTART:20200101T100000Z\nEND:VEVENT\nEND:VCALENDAR`;
    const { events } = parseICS(pastIcs);
    const { drafts } = icsEventsToPostDrafts(events);
    expect(drafts).toHaveLength(1);
  });
});
