import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { DELETE } from "../[id]/route";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    scheduleTimePreset: {
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

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockFindMany = prisma.scheduleTimePreset
  .findMany as jest.MockedFunction<
  typeof prisma.scheduleTimePreset.findMany
>;
const mockCount = prisma.scheduleTimePreset.count as jest.MockedFunction<
  typeof prisma.scheduleTimePreset.count
>;
const mockCreate = prisma.scheduleTimePreset.create as jest.MockedFunction<
  typeof prisma.scheduleTimePreset.create
>;
const mockFindUnique =
  prisma.scheduleTimePreset.findUnique as jest.MockedFunction<
    typeof prisma.scheduleTimePreset.findUnique
  >;
const mockDelete = prisma.scheduleTimePreset.delete as jest.MockedFunction<
  typeof prisma.scheduleTimePreset.delete
>;
const mockLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;

const fakePreset = {
  id: "preset-abc123xyz",
  name: "Monday Morning",
  hour: 9,
  minute: 0,
  daysOfWeek: [1],
  timezone: "UTC",
  userId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function makePostReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/schedule-presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAuth.mockResolvedValue({ user: { id: "user-1" } } as any);
  mockLimiter.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
});

// ── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/schedule-presets", () => {
  it("returns 401 when unauthenticated", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue(null as any);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("returns presets list", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFindMany.mockResolvedValue([fakePreset] as any);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { presets: typeof fakePreset[] };
    expect(body.presets).toHaveLength(1);
    expect(body.presets[0].name).toBe("Monday Morning");
    expect(body.presets[0].hour).toBe(9);
    expect(body.presets[0].daysOfWeek).toEqual([1]);
  });

  it("returns empty list when no presets", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFindMany.mockResolvedValue([] as any);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { presets: unknown[] };
    expect(body.presets).toHaveLength(0);
  });
});

// ── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/schedule-presets", () => {
  it("returns 401 when unauthenticated", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue(null as any);
    const res = await POST(
      makePostReq({ name: "Test", hour: 9, minute: 0 })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await POST(
      makePostReq({ name: "Test", hour: 9, minute: 0 })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid body — bad hour", async () => {
    const res = await POST(makePostReq({ name: "Test", hour: 25, minute: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body — empty name", async () => {
    const res = await POST(makePostReq({ name: "", hour: 9, minute: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/schedule-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 when max presets reached", async () => {
    mockCount.mockResolvedValue(30);
    const res = await POST(
      makePostReq({ name: "Test", hour: 9, minute: 0 })
    );
    expect(res.status).toBe(422);
  });

  it("creates and returns preset with 201", async () => {
    mockCount.mockResolvedValue(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(fakePreset as any);
    const res = await POST(
      makePostReq({
        name: "Monday Morning",
        hour: 9,
        minute: 0,
        daysOfWeek: [1],
        timezone: "UTC",
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as typeof fakePreset;
    expect(body.name).toBe("Monday Morning");
    expect(body.hour).toBe(9);
  });

  it("uses default empty daysOfWeek and UTC timezone when omitted", async () => {
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue({
      ...fakePreset,
      daysOfWeek: [],
      timezone: "UTC",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await POST(
      makePostReq({ name: "Daily 9am", hour: 9, minute: 0 })
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ daysOfWeek: [], timezone: "UTC" }),
      })
    );
  });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/schedule-presets/[id]", () => {
  function makeDeleteReq(id: string): NextRequest {
    return new NextRequest(
      `http://localhost/api/schedule-presets/${id}`,
      { method: "DELETE" }
    );
  }

  it("returns 401 when unauthenticated", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue(null as any);
    const res = await DELETE(makeDeleteReq("preset-abc123xyz"), {
      params: Promise.resolve({ id: "preset-abc123xyz" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockLimiter.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await DELETE(makeDeleteReq("preset-abc123xyz"), {
      params: Promise.resolve({ id: "preset-abc123xyz" }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for short id", async () => {
    const res = await DELETE(makeDeleteReq("short"), {
      params: Promise.resolve({ id: "short" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when preset not found", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFindUnique.mockResolvedValue(null as any);
    const res = await DELETE(makeDeleteReq("preset-abc123xyz"), {
      params: Promise.resolve({ id: "preset-abc123xyz" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when preset belongs to another user", async () => {
    mockFindUnique.mockResolvedValue({
      ...fakePreset,
      userId: "other-user",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await DELETE(makeDeleteReq("preset-abc123xyz"), {
      params: Promise.resolve({ id: "preset-abc123xyz" }),
    });
    expect(res.status).toBe(404);
  });

  it("deletes preset and returns 204", async () => {
    mockFindUnique.mockResolvedValue({
      ...fakePreset,
      userId: "user-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDelete.mockResolvedValue(fakePreset as any);
    const res = await DELETE(makeDeleteReq("preset-abc123xyz"), {
      params: Promise.resolve({ id: "preset-abc123xyz" }),
    });
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({
      where: { id: "preset-abc123xyz" },
    });
  });
});
