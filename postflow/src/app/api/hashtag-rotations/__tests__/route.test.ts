jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
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
    hashtagRotation: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    hashtagGroup: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";
import { GET as GET_CURRENT } from "../[id]/current/route";
import { POST as POST_NEXT } from "../[id]/next/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockLimiter = apiLimiter as jest.Mock;
const mockRotationFindMany = prisma.hashtagRotation.findMany as jest.Mock;
const mockRotationCount = prisma.hashtagRotation.count as jest.Mock;
const mockRotationCreate = prisma.hashtagRotation.create as jest.Mock;
const mockRotationFindFirst = prisma.hashtagRotation.findFirst as jest.Mock;
const mockRotationUpdate = prisma.hashtagRotation.update as jest.Mock;
const mockRotationDelete = prisma.hashtagRotation.delete as jest.Mock;
const mockGroupFindMany = prisma.hashtagGroup.findMany as jest.Mock;
const mockGroupFindFirst = prisma.hashtagGroup.findFirst as jest.Mock;

const AUTHED = { user: { id: "user-1" } };
const RL_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

const sampleGroup = {
  id: "group-1",
  name: "Monday Tags",
  hashtags: ["#monday", "#motivation"],
};

const sampleRotation = {
  id: "rot-1",
  userId: "user-1",
  name: "Weekly Rotation",
  description: null,
  groupIds: ["group-1", "group-2"],
  currentIndex: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReq(
  url: string,
  opts?: { method?: string; body?: string }
): NextRequest {
  return new NextRequest(url, {
    method: opts?.method ?? "GET",
    headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
    body: opts?.body,
  });
}

function makeParamReq(
  url: string,
  params: { id: string },
  opts?: { method?: string; body?: string }
): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(url, {
      method: opts?.method ?? "GET",
      headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
      body: opts?.body,
    }),
    { params: Promise.resolve(params) },
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/hashtag-rotations ────────────────────────────────────────────────

describe("GET /api/hashtag-rotations", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("returns empty list when no rotations", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationFindMany.mockResolvedValue([]);
    mockGroupFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rotations).toEqual([]);
  });

  it("returns rotations with resolved group info", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationFindMany.mockResolvedValue([sampleRotation]);
    mockGroupFindMany.mockResolvedValue([sampleGroup]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rotations).toHaveLength(1);
    expect(body.rotations[0].name).toBe("Weekly Rotation");
    expect(body.rotations[0].currentGroup).toBeDefined();
  });
});

// ── POST /api/hashtag-rotations ───────────────────────────────────────────────

describe("POST /api/hashtag-rotations", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(
      makeReq("http://localhost/api/hashtag-rotations", {
        method: "POST",
        body: JSON.stringify({ name: "Rotation", groupIds: ["group-1"] }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_FAIL);
    const res = await POST(
      makeReq("http://localhost/api/hashtag-rotations", {
        method: "POST",
        body: JSON.stringify({ name: "Rotation", groupIds: ["group-1"] }),
      })
    );
    expect(res.status).toBe(429);
  });

  it("returns 422 when max limit reached", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationCount.mockResolvedValue(20);
    const res = await POST(
      makeReq("http://localhost/api/hashtag-rotations", {
        method: "POST",
        body: JSON.stringify({ name: "Rotation", groupIds: ["group-1"] }),
      })
    );
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid body (empty groupIds)", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationCount.mockResolvedValue(0);
    const res = await POST(
      makeReq("http://localhost/api/hashtag-rotations", {
        method: "POST",
        body: JSON.stringify({ name: "Rotation", groupIds: [] }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when groupIds not owned by user", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationCount.mockResolvedValue(0);
    mockGroupFindMany.mockResolvedValue([]); // none found
    const res = await POST(
      makeReq("http://localhost/api/hashtag-rotations", {
        method: "POST",
        body: JSON.stringify({ name: "Rotation", groupIds: ["non-existent"] }),
      })
    );
    expect(res.status).toBe(404);
  });

  it("creates rotation successfully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationCount.mockResolvedValue(0);
    mockGroupFindMany.mockResolvedValue([{ id: "group-1" }]);
    mockRotationCreate.mockResolvedValue({
      ...sampleRotation,
      groupIds: ["group-1"],
    });
    const res = await POST(
      makeReq("http://localhost/api/hashtag-rotations", {
        method: "POST",
        body: JSON.stringify({ name: "Weekly Rotation", groupIds: ["group-1"] }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Weekly Rotation");
  });
});

// ── PATCH /api/hashtag-rotations/[id] ────────────────────────────────────────

describe("PATCH /api/hashtag-rotations/[id]", () => {
  it("returns 404 when rotation not found / not owned", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationFindFirst.mockResolvedValue(null);
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1",
      { id: "rot-1" },
      { method: "PATCH", body: JSON.stringify({ isActive: false }) }
    );
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it("updates rotation successfully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationFindFirst.mockResolvedValue(sampleRotation);
    mockRotationUpdate.mockResolvedValue({ ...sampleRotation, isActive: false });
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1",
      { id: "rot-1" },
      { method: "PATCH", body: JSON.stringify({ isActive: false }) }
    );
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isActive).toBe(false);
  });
});

// ── DELETE /api/hashtag-rotations/[id] ───────────────────────────────────────

describe("DELETE /api/hashtag-rotations/[id]", () => {
  it("returns 404 when rotation not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationFindFirst.mockResolvedValue(null);
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1",
      { id: "rot-1" },
      { method: "DELETE" }
    );
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
  });

  it("deletes rotation successfully", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationFindFirst.mockResolvedValue(sampleRotation);
    mockRotationDelete.mockResolvedValue(sampleRotation);
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1",
      { id: "rot-1" },
      { method: "DELETE" }
    );
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(204);
  });
});

// ── GET /api/hashtag-rotations/[id]/current ───────────────────────────────────

describe("GET /api/hashtag-rotations/[id]/current", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1/current",
      { id: "rot-1" }
    );
    const res = await GET_CURRENT(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when rotation not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationFindFirst.mockResolvedValue(null);
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1/current",
      { id: "rot-1" }
    );
    const res = await GET_CURRENT(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 when rotation has no groups", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationFindFirst.mockResolvedValue({ ...sampleRotation, groupIds: [] });
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1/current",
      { id: "rot-1" }
    );
    const res = await GET_CURRENT(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns current group hashtags without advancing", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationFindFirst.mockResolvedValue(sampleRotation);
    mockGroupFindFirst.mockResolvedValue(sampleGroup);
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1/current",
      { id: "rot-1" }
    );
    const res = await GET_CURRENT(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.group.hashtags).toEqual(["#monday", "#motivation"]);
    expect(body.currentIndex).toBe(0);
    expect(mockRotationUpdate).not.toHaveBeenCalled();
  });
});

// ── POST /api/hashtag-rotations/[id]/next ─────────────────────────────────────

describe("POST /api/hashtag-rotations/[id]/next", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1/next",
      { id: "rot-1" },
      { method: "POST" }
    );
    const res = await POST_NEXT(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when rotation not found", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationFindFirst.mockResolvedValue(null);
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1/next",
      { id: "rot-1" },
      { method: "POST" }
    );
    const res = await POST_NEXT(req, ctx);
    expect(res.status).toBe(404);
  });

  it("advances index and returns current group's hashtags", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    mockRotationFindFirst.mockResolvedValue(sampleRotation); // currentIndex=0, groupIds=[group-1, group-2]
    mockRotationUpdate.mockResolvedValue({ ...sampleRotation, currentIndex: 1 });
    mockGroupFindFirst.mockResolvedValue(sampleGroup);
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1/next",
      { id: "rot-1" },
      { method: "POST" }
    );
    const res = await POST_NEXT(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usedIndex).toBe(0);
    expect(body.nextIndex).toBe(1);
    expect(body.group.hashtags).toEqual(["#monday", "#motivation"]);
    // Update was called with nextIndex=1
    expect(mockRotationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentIndex: 1 } })
    );
  });

  it("wraps around to 0 when at last group", async () => {
    mockAuth.mockResolvedValue(AUTHED);
    mockLimiter.mockResolvedValue(RL_OK);
    // currentIndex=1 (last), groupIds has 2 items → next=0
    mockRotationFindFirst.mockResolvedValue({
      ...sampleRotation,
      groupIds: ["group-1", "group-2"],
      currentIndex: 1,
    });
    mockRotationUpdate.mockResolvedValue({ ...sampleRotation, currentIndex: 0 });
    mockGroupFindFirst.mockResolvedValue(sampleGroup);
    const [req, ctx] = makeParamReq(
      "http://localhost/api/hashtag-rotations/rot-1/next",
      { id: "rot-1" },
      { method: "POST" }
    );
    const res = await POST_NEXT(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usedIndex).toBe(1);
    expect(body.nextIndex).toBe(0);
  });
});
