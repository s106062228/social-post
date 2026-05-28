import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    calendarShare: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    post: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn().mockResolvedValue({ success: true }),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const USER = { user: { id: "u1" } };

function req(body?: unknown, method = "GET"): NextRequest {
  const url = "http://localhost/api/calendar-shares";
  if (body) {
    return new NextRequest(url, {
      method,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }
  return new NextRequest(url, { method });
}

// ── GET /api/calendar-shares ──────────────────────────────────────────────────
describe("GET /api/calendar-shares", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { GET } = await import("../calendar-shares/route");
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns shares list", async () => {
    mockAuth.mockResolvedValue(USER);
    const shares = [
      {
        id: "s1", token: "tok1", title: "Client A", platforms: [],
        startDate: null, endDate: null, showContent: true,
        expiresAt: null, views: 3, createdAt: new Date(), updatedAt: new Date(),
      },
    ];
    mockPrisma.calendarShare.findMany.mockResolvedValue(shares as never);
    const { GET } = await import("../calendar-shares/route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.shares).toHaveLength(1);
    expect(data.shares[0].title).toBe("Client A");
  });
});

// ── POST /api/calendar-shares ─────────────────────────────────────────────────
describe("POST /api/calendar-shares", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { POST } = await import("../calendar-shares/route");
    const res = await POST(req({ title: "Test" }, "POST"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body (empty title)", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.calendarShare.count.mockResolvedValue(0 as never);
    const { POST } = await import("../calendar-shares/route");
    const res = await POST(req({ title: "" }, "POST"));
    expect(res.status).toBe(400);
  });

  it("returns 422 when max shares reached", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.calendarShare.count.mockResolvedValue(20 as never);
    const { POST } = await import("../calendar-shares/route");
    const res = await POST(req({ title: "Test" }, "POST"));
    expect(res.status).toBe(422);
  });

  it("creates and returns calendar share", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.calendarShare.count.mockResolvedValue(0 as never);
    const created = {
      id: "s1", token: "tok1", title: "Client A", platforms: [],
      startDate: null, endDate: null, showContent: true,
      expiresAt: null, views: 0, createdAt: new Date(), updatedAt: new Date(),
    };
    mockPrisma.calendarShare.create.mockResolvedValue(created as never);
    const { POST } = await import("../calendar-shares/route");
    const res = await POST(req({ title: "Client A" }, "POST"));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.share.title).toBe("Client A");
  });
});

// ── DELETE /api/calendar-shares/[id] ─────────────────────────────────────────
describe("DELETE /api/calendar-shares/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { DELETE } = await import("../calendar-shares/[id]/route");
    const res = await DELETE(req(undefined, "DELETE"), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when share not found", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.calendarShare.findUnique.mockResolvedValue(null as never);
    const { DELETE } = await import("../calendar-shares/[id]/route");
    const res = await DELETE(req(undefined, "DELETE"), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when not owner", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.calendarShare.findUnique.mockResolvedValue({ userId: "other" } as never);
    const { DELETE } = await import("../calendar-shares/[id]/route");
    const res = await DELETE(req(undefined, "DELETE"), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(403);
  });

  it("deletes share and returns 204", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.calendarShare.findUnique.mockResolvedValue({ userId: "u1" } as never);
    mockPrisma.calendarShare.delete.mockResolvedValue({} as never);
    const { DELETE } = await import("../calendar-shares/[id]/route");
    const res = await DELETE(req(undefined, "DELETE"), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(204);
  });
});

// ── GET /api/cal/[token] ──────────────────────────────────────────────────────
describe("GET /api/cal/[token] (public)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when token not found", async () => {
    mockPrisma.calendarShare.findUnique.mockResolvedValue(null as never);
    const { GET } = await import("../cal/[token]/route");
    const r = new NextRequest("http://localhost/api/cal/bad");
    const res = await GET(r, { params: Promise.resolve({ token: "bad" }) });
    expect(res.status).toBe(404);
  });

  it("returns 410 for expired share", async () => {
    mockPrisma.calendarShare.findUnique.mockResolvedValue({
      userId: "u1", token: "tok1", title: "T", platforms: [],
      startDate: null, endDate: null, showContent: true,
      expiresAt: new Date("2020-01-01"), views: 0,
    } as never);
    const { GET } = await import("../cal/[token]/route");
    const r = new NextRequest("http://localhost/api/cal/tok1");
    const res = await GET(r, { params: Promise.resolve({ token: "tok1" }) });
    expect(res.status).toBe(410);
  });

  it("returns calendar data with posts", async () => {
    mockPrisma.calendarShare.findUnique.mockResolvedValue({
      userId: "u1", token: "tok1", title: "My Calendar", platforms: [],
      startDate: null, endDate: null, showContent: true, expiresAt: null, views: 0,
    } as never);
    mockPrisma.calendarShare.update.mockResolvedValue({} as never);
    mockPrisma.post.findMany.mockResolvedValue([
      {
        id: "p1", content: "Hello", scheduledAt: new Date("2026-07-15T10:00:00Z"),
        status: "SCHEDULED", mediaType: "NONE",
        publishResults: [{ platform: "FACEBOOK", status: "PENDING" }],
      },
    ] as never);
    const { GET } = await import("../cal/[token]/route");
    const r = new NextRequest("http://localhost/api/cal/tok1");
    const res = await GET(r, { params: Promise.resolve({ token: "tok1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("My Calendar");
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].content).toBe("Hello");
    expect(data.posts[0].platforms).toContain("FACEBOOK");
  });

  it("hides post content when showContent is false", async () => {
    mockPrisma.calendarShare.findUnique.mockResolvedValue({
      userId: "u1", token: "tok2", title: "Hidden", platforms: [],
      startDate: null, endDate: null, showContent: false, expiresAt: null, views: 0,
    } as never);
    mockPrisma.calendarShare.update.mockResolvedValue({} as never);
    mockPrisma.post.findMany.mockResolvedValue([
      {
        id: "p1", content: undefined, scheduledAt: new Date("2026-07-15T10:00:00Z"),
        status: "SCHEDULED", mediaType: "NONE", publishResults: [],
      },
    ] as never);
    const { GET } = await import("../cal/[token]/route");
    const r = new NextRequest("http://localhost/api/cal/tok2");
    const res = await GET(r, { params: Promise.resolve({ token: "tok2" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.showContent).toBe(false);
    expect(data.posts[0].content).toBeNull();
  });
});
