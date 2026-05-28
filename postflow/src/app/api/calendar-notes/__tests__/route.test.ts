import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    calendarNote: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn().mockResolvedValue({ success: true }),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

import { GET, POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;

type AuthSession = Awaited<ReturnType<typeof auth>>;

function mockSession(id = "user-1") {
  mockAuth.mockResolvedValue({
    user: { id, email: "test@test.com", name: "Test" },
    expires: "2099-01-01",
  } as AuthSession);
}

function makeReq(method: string, body?: unknown, searchParams?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/calendar-notes");
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : {},
  });
}

function makeIdReq(method: string, body?: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost/api/calendar-notes/n1"), {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : {},
  });
}

const idParams = { params: Promise.resolve({ id: "n1" }) };

const sampleNote = {
  id: "n1",
  userId: "user-1",
  date: "2026-01-15",
  title: "Product Launch",
  body: "Big day!",
  color: "#6366f1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// ── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/calendar-notes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValueOnce({ success: false, limit: 100, remaining: 0, reset: 0 });
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(429);
  });

  it("returns notes list", async () => {
    (prisma.calendarNote.findMany as jest.Mock).mockResolvedValue([sampleNote]);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.notes).toHaveLength(1);
    expect(data.notes[0].title).toBe("Product Launch");
  });

  it("passes month filter to query when provided", async () => {
    (prisma.calendarNote.findMany as jest.Mock).mockResolvedValue([]);
    await GET(makeReq("GET", undefined, { month: "2026-01" }));
    expect(prisma.calendarNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { startsWith: "2026-01" },
        }),
      })
    );
  });
});

// ── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/calendar-notes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
    (prisma.calendarNote.count as jest.Mock).mockResolvedValue(0);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq("POST", { date: "2026-01-15", title: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValueOnce({ success: false, limit: 100, remaining: 0, reset: 0 });
    const res = await POST(makeReq("POST", { date: "2026-01-15", title: "Test" }));
    expect(res.status).toBe(429);
  });

  it("returns 422 when max notes reached", async () => {
    (prisma.calendarNote.count as jest.Mock).mockResolvedValue(500);
    const res = await POST(makeReq("POST", { date: "2026-01-15", title: "Test" }));
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid date format", async () => {
    const res = await POST(makeReq("POST", { date: "01/15/2026", title: "Test" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(makeReq("POST", { date: "2026-01-15" }));
    expect(res.status).toBe(400);
  });

  it("creates a note successfully and returns 201", async () => {
    (prisma.calendarNote.create as jest.Mock).mockResolvedValue(sampleNote);
    const res = await POST(
      makeReq("POST", { date: "2026-01-15", title: "Product Launch", color: "#6366f1" })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.note.id).toBe("n1");
    expect(data.note.title).toBe("Product Launch");
  });

  it("uses default color when not provided", async () => {
    (prisma.calendarNote.create as jest.Mock).mockResolvedValue(sampleNote);
    await POST(makeReq("POST", { date: "2026-01-15", title: "Test" }));
    expect(prisma.calendarNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ color: "#6366f1" }),
      })
    );
  });
});

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/calendar-notes/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeIdReq("PATCH", { title: "Updated" }), idParams);
    expect(res.status).toBe(401);
  });

  it("returns 404 when note not found", async () => {
    (prisma.calendarNote.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await PATCH(makeIdReq("PATCH", { title: "Updated" }), idParams);
    expect(res.status).toBe(404);
  });

  it("returns 403 when note belongs to another user", async () => {
    (prisma.calendarNote.findUnique as jest.Mock).mockResolvedValue({
      ...sampleNote,
      userId: "other-user",
    });
    const res = await PATCH(makeIdReq("PATCH", { title: "Updated" }), idParams);
    expect(res.status).toBe(403);
  });

  it("updates note successfully", async () => {
    (prisma.calendarNote.findUnique as jest.Mock).mockResolvedValue(sampleNote);
    (prisma.calendarNote.update as jest.Mock).mockResolvedValue({
      ...sampleNote,
      title: "Updated",
    });
    const res = await PATCH(makeIdReq("PATCH", { title: "Updated" }), idParams);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.note.title).toBe("Updated");
  });
});

// ── DELETE ────────────────────────────────────────────────────────────────────

describe("DELETE /api/calendar-notes/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeIdReq("DELETE"), idParams);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValueOnce({ success: false, limit: 100, remaining: 0, reset: 0 });
    const res = await DELETE(makeIdReq("DELETE"), idParams);
    expect(res.status).toBe(429);
  });

  it("returns 404 when note not found", async () => {
    (prisma.calendarNote.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(makeIdReq("DELETE"), idParams);
    expect(res.status).toBe(404);
  });

  it("returns 403 when note belongs to another user", async () => {
    (prisma.calendarNote.findUnique as jest.Mock).mockResolvedValue({
      ...sampleNote,
      userId: "other-user",
    });
    const res = await DELETE(makeIdReq("DELETE"), idParams);
    expect(res.status).toBe(403);
  });

  it("deletes note successfully and returns 204", async () => {
    (prisma.calendarNote.findUnique as jest.Mock).mockResolvedValue(sampleNote);
    (prisma.calendarNote.delete as jest.Mock).mockResolvedValue({});
    const res = await DELETE(makeIdReq("DELETE"), idParams);
    expect(res.status).toBe(204);
  });
});
