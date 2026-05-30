import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    clientPortal: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    publishResult: {
      findMany: jest.fn(),
    },
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

function makeReq(url: string, body?: unknown, method = "GET"): NextRequest {
  if (body) {
    return new NextRequest(url, {
      method,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }
  return new NextRequest(url, { method });
}

function listReq(method = "GET", body?: unknown): NextRequest {
  return makeReq("http://localhost/api/client-portals", body, method);
}

function idReq(id: string, method = "PATCH", body?: unknown): NextRequest {
  return makeReq(`http://localhost/api/client-portals/${id}`, body, method);
}

const samplePortal = {
  id: "p1",
  userId: "u1",
  slug: "test-portal",
  title: "Test Portal",
  description: null,
  accentColor: "#6366f1",
  showCalendar: true,
  showAnalytics: true,
  showPosts: true,
  isPublished: false,
  expiresAt: null,
  views: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── GET /api/client-portals ───────────────────────────────────────────────────
describe("GET /api/client-portals", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { GET } = await import("../client-portals/route");
    const res = await GET(listReq());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(USER);
    const { apiLimiter } = await import("@/lib/rate-limit");
    (apiLimiter as jest.Mock).mockResolvedValueOnce({ success: false });
    const { GET } = await import("../client-portals/route");
    const res = await GET(listReq());
    expect(res.status).toBe(429);
  });

  it("returns portals list", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.clientPortal.findMany.mockResolvedValue([samplePortal] as never);
    const { GET } = await import("../client-portals/route");
    const res = await GET(listReq());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.portals).toHaveLength(1);
    expect(data.portals[0].title).toBe("Test Portal");
  });
});

// ── POST /api/client-portals ──────────────────────────────────────────────────
describe("POST /api/client-portals", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { POST } = await import("../client-portals/route");
    const res = await POST(listReq("POST", { title: "T" }));
    expect(res.status).toBe(401);
  });

  it("returns 422 when max portals reached", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.clientPortal.count.mockResolvedValue(10 as never);
    const { POST } = await import("../client-portals/route");
    const res = await POST(listReq("POST", { title: "Extra" }));
    expect(res.status).toBe(422);
  });

  it("returns 409 when slug already in use", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.clientPortal.count.mockResolvedValue(0 as never);
    mockPrisma.clientPortal.findUnique.mockResolvedValue(samplePortal as never);
    const { POST } = await import("../client-portals/route");
    const res = await POST(listReq("POST", { title: "Test", slug: "test-portal" }));
    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.clientPortal.count.mockResolvedValue(0 as never);
    const { POST } = await import("../client-portals/route");
    const res = await POST(listReq("POST", { title: "" }));
    expect(res.status).toBe(400);
  });

  it("creates portal and returns 201", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.clientPortal.count.mockResolvedValue(0 as never);
    mockPrisma.clientPortal.findUnique.mockResolvedValue(null as never);
    mockPrisma.clientPortal.create.mockResolvedValue(samplePortal as never);
    const { POST } = await import("../client-portals/route");
    const res = await POST(listReq("POST", { title: "My Portal" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.portal.title).toBe("Test Portal");
  });

  it("auto-generates slug when not provided", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.clientPortal.count.mockResolvedValue(0 as never);
    mockPrisma.clientPortal.findUnique.mockResolvedValue(null as never);
    mockPrisma.clientPortal.create.mockResolvedValue({ ...samplePortal, slug: "my-portal" } as never);
    const { POST } = await import("../client-portals/route");
    const res = await POST(listReq("POST", { title: "My Portal" }));
    expect(res.status).toBe(201);
    expect(mockPrisma.clientPortal.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: expect.any(String) }) })
    );
  });
});

// ── PATCH /api/client-portals/[id] ───────────────────────────────────────────
describe("PATCH /api/client-portals/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { PATCH } = await import("../client-portals/[id]/route");
    const res = await PATCH(idReq("p1"), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when portal not found", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.clientPortal.findUnique.mockResolvedValue(null as never);
    const { PATCH } = await import("../client-portals/[id]/route");
    const res = await PATCH(idReq("p99", "PATCH", { title: "X" }), { params: Promise.resolve({ id: "p99" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when owned by another user", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.clientPortal.findUnique.mockResolvedValue({ ...samplePortal, userId: "other" } as never);
    const { PATCH } = await import("../client-portals/[id]/route");
    const res = await PATCH(idReq("p1", "PATCH", { title: "X" }), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(403);
  });

  it("updates portal and returns it", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.clientPortal.findUnique.mockResolvedValue(samplePortal as never);
    mockPrisma.clientPortal.update.mockResolvedValue({ ...samplePortal, title: "Updated" } as never);
    const { PATCH } = await import("../client-portals/[id]/route");
    const res = await PATCH(idReq("p1", "PATCH", { title: "Updated" }), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.portal.title).toBe("Updated");
  });
});

// ── DELETE /api/client-portals/[id] ──────────────────────────────────────────
describe("DELETE /api/client-portals/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when portal not found", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.clientPortal.findUnique.mockResolvedValue(null as never);
    const { DELETE } = await import("../client-portals/[id]/route");
    const res = await DELETE(idReq("p99", "DELETE"), { params: Promise.resolve({ id: "p99" }) });
    expect(res.status).toBe(404);
  });

  it("deletes portal and returns success", async () => {
    mockAuth.mockResolvedValue(USER);
    mockPrisma.clientPortal.findUnique.mockResolvedValue(samplePortal as never);
    mockPrisma.clientPortal.delete.mockResolvedValue(samplePortal as never);
    const { DELETE } = await import("../client-portals/[id]/route");
    const res = await DELETE(idReq("p1", "DELETE"), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});

// ── GET /api/portal/[slug] (public) ──────────────────────────────────────────
describe("GET /api/portal/[slug]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when portal not found", async () => {
    mockPrisma.clientPortal.findUnique.mockResolvedValue(null as never);
    const { GET } = await import("../portal/[slug]/route");
    const res = await GET(makeReq("http://localhost/api/portal/missing"), { params: Promise.resolve({ slug: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when portal is unpublished", async () => {
    mockPrisma.clientPortal.findUnique.mockResolvedValue({ ...samplePortal, isPublished: false } as never);
    const { GET } = await import("../portal/[slug]/route");
    const res = await GET(makeReq("http://localhost/api/portal/test-portal"), { params: Promise.resolve({ slug: "test-portal" }) });
    expect(res.status).toBe(404);
  });

  it("returns 410 when portal has expired", async () => {
    const expired = { ...samplePortal, isPublished: true, expiresAt: new Date("2020-01-01") };
    mockPrisma.clientPortal.findUnique.mockResolvedValue(expired as never);
    mockPrisma.clientPortal.update.mockResolvedValue(expired as never);
    const { GET } = await import("../portal/[slug]/route");
    const res = await GET(makeReq("http://localhost/api/portal/test-portal"), { params: Promise.resolve({ slug: "test-portal" }) });
    expect(res.status).toBe(410);
  });

  it("returns portal meta and increments views", async () => {
    const published = { ...samplePortal, isPublished: true };
    mockPrisma.clientPortal.findUnique.mockResolvedValue(published as never);
    mockPrisma.clientPortal.update.mockResolvedValue({ ...published, views: 1 } as never);
    const { GET } = await import("../portal/[slug]/route");
    const res = await GET(makeReq("http://localhost/api/portal/test-portal"), { params: Promise.resolve({ slug: "test-portal" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("Test Portal");
    expect(data.accentColor).toBe("#6366f1");
    expect(data.showCalendar).toBe(true);
    expect(mockPrisma.clientPortal.update).toHaveBeenCalled();
  });
});

// ── GET /api/portal/[slug]/calendar (public) ──────────────────────────────────
describe("GET /api/portal/[slug]/calendar", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when portal not found", async () => {
    mockPrisma.clientPortal.findUnique.mockResolvedValue(null as never);
    const { GET } = await import("../portal/[slug]/calendar/route");
    const res = await GET(makeReq("http://localhost/api/portal/missing/calendar"), { params: Promise.resolve({ slug: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns calendar posts", async () => {
    const published = { ...samplePortal, isPublished: true };
    mockPrisma.clientPortal.findUnique.mockResolvedValue(published as never);
    mockPrisma.post.findMany.mockResolvedValue([
      {
        id: "post1",
        content: "Hello world",
        scheduledAt: new Date(),
        status: "SCHEDULED",
        mediaType: "NONE",
        publishResults: [{ platform: "FACEBOOK" }],
      },
    ] as never);
    const { GET } = await import("../portal/[slug]/calendar/route");
    const res = await GET(makeReq("http://localhost/api/portal/test-portal/calendar"), { params: Promise.resolve({ slug: "test-portal" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].content).toBe("Hello world");
    expect(data.posts[0].platforms).toContain("FACEBOOK");
  });
});

// ── GET /api/portal/[slug]/analytics (public) ────────────────────────────────
describe("GET /api/portal/[slug]/analytics", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when portal not found", async () => {
    mockPrisma.clientPortal.findUnique.mockResolvedValue(null as never);
    const { GET } = await import("../portal/[slug]/analytics/route");
    const res = await GET(makeReq("http://localhost/api/portal/missing/analytics"), { params: Promise.resolve({ slug: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns analytics summary", async () => {
    const published = { ...samplePortal, isPublished: true };
    mockPrisma.clientPortal.findUnique.mockResolvedValue(published as never);
    mockPrisma.post.count.mockResolvedValueOnce(42 as never).mockResolvedValueOnce(5 as never);
    mockPrisma.publishResult.findMany.mockResolvedValue([
      { platform: "FACEBOOK" },
      { platform: "FACEBOOK" },
      { platform: "INSTAGRAM" },
    ] as never);
    mockPrisma.post.findMany.mockResolvedValue([
      { updatedAt: new Date() },
    ] as never);
    const { GET } = await import("../portal/[slug]/analytics/route");
    const res = await GET(makeReq("http://localhost/api/portal/test-portal/analytics"), { params: Promise.resolve({ slug: "test-portal" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalPublished).toBe(42);
    expect(data.scheduledCount).toBe(5);
    expect(data.platformBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: "FACEBOOK", count: 2 }),
        expect.objectContaining({ platform: "INSTAGRAM", count: 1 }),
      ])
    );
    expect(data.last30DayActivity).toHaveLength(30);
  });
});
