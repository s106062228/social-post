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
    collaboration: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    collaborationPost: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      findFirst: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listCollaborations, POST as createCollaboration } from "@/app/api/collaborations/route";
import {
  GET as getCollaboration,
  PATCH as updateCollaboration,
  DELETE as deleteCollaboration,
} from "@/app/api/collaborations/[id]/route";
import { GET as getPerformance } from "@/app/api/collaborations/[id]/performance/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.collaboration.findMany as jest.Mock;
const mockFindFirst = prisma.collaboration.findFirst as jest.Mock;
const mockCount = prisma.collaboration.count as jest.Mock;
const mockCreate = prisma.collaboration.create as jest.Mock;
const mockUpdate = prisma.collaboration.update as jest.Mock;
const mockDelete = prisma.collaboration.delete as jest.Mock;

const MOCK_USER_ID = "cltest0000000user000001";
const OTHER_USER_ID = "cltest0000000user000002";
const COLLAB_ID = "cltest0000000coll000001";

const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_COLLAB = {
  id: COLLAB_ID,
  userId: MOCK_USER_ID,
  name: "Summer Campaign",
  partnerName: "Jane Influencer",
  partnerHandle: "@janeinfluencer",
  platform: "INSTAGRAM",
  deliverables: ["3 posts", "5 stories"],
  startDate: new Date("2026-06-01T00:00:00.000Z"),
  endDate: new Date("2026-08-31T00:00:00.000Z"),
  budget: 1500,
  notes: "Product gifted",
  status: "ACTIVE",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  _count: { posts: 3 },
};

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
});

// ── GET /api/collaborations ───────────────────────────────────────────────────

describe("GET /api/collaborations", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listCollaborations();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await listCollaborations();
    expect(res.status).toBe(429);
  });

  it("returns empty array when no collaborations", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await listCollaborations();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.collaborations).toEqual([]);
  });

  it("returns collaborations with _count.posts", async () => {
    mockFindMany.mockResolvedValue([BASE_COLLAB]);
    const res = await listCollaborations();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.collaborations).toHaveLength(1);
    expect(data.collaborations[0].partnerName).toBe("Jane Influencer");
    expect(data.collaborations[0]._count.posts).toBe(3);
  });
});

// ── POST /api/collaborations ──────────────────────────────────────────────────

describe("POST /api/collaborations", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/collaborations", {
      method: "POST",
      body: JSON.stringify({ name: "Test", partnerName: "Partner" }),
    });
    const res = await createCollaboration(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when partnerName is missing", async () => {
    mockCount.mockResolvedValue(0);
    const req = makeRequest("http://localhost/api/collaborations", {
      method: "POST",
      body: JSON.stringify({ name: "Summer Campaign" }),
    });
    const res = await createCollaboration(req);
    expect(res.status).toBe(400);
  });

  it("returns 201 on success with name and partnerName", async () => {
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue({ ...BASE_COLLAB });
    const req = makeRequest("http://localhost/api/collaborations", {
      method: "POST",
      body: JSON.stringify({ name: "Summer Campaign", partnerName: "Jane Influencer" }),
    });
    const res = await createCollaboration(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Summer Campaign");
  });

  it("returns 409 when max collaborations reached", async () => {
    mockCount.mockResolvedValue(50);
    const req = makeRequest("http://localhost/api/collaborations", {
      method: "POST",
      body: JSON.stringify({ name: "New", partnerName: "Partner" }),
    });
    const res = await createCollaboration(req);
    expect(res.status).toBe(409);
  });
});

// ── PATCH /api/collaborations/[id] ───────────────────────────────────────────

describe("PATCH /api/collaborations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest(`http://localhost/api/collaborations/${COLLAB_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    const res = await updateCollaboration(req, makeContext(COLLAB_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found (wrong user)", async () => {
    mockFindFirst.mockResolvedValue(null);
    const req = makeRequest(`http://localhost/api/collaborations/${COLLAB_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    const res = await updateCollaboration(req, makeContext(COLLAB_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful update", async () => {
    mockFindFirst.mockResolvedValue(BASE_COLLAB);
    mockUpdate.mockResolvedValue({ ...BASE_COLLAB, status: "COMPLETED" });
    const req = makeRequest(`http://localhost/api/collaborations/${COLLAB_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    const res = await updateCollaboration(req, makeContext(COLLAB_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.collaboration.status).toBe("COMPLETED");
  });
});

// ── DELETE /api/collaborations/[id] ──────────────────────────────────────────

describe("DELETE /api/collaborations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest(`http://localhost/api/collaborations/${COLLAB_ID}`, {
      method: "DELETE",
    });
    const res = await deleteCollaboration(req, makeContext(COLLAB_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found (ownership check)", async () => {
    mockFindFirst.mockResolvedValue(null);
    const req = makeRequest(`http://localhost/api/collaborations/${COLLAB_ID}`, {
      method: "DELETE",
    });
    const res = await deleteCollaboration(req, makeContext(COLLAB_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful delete", async () => {
    mockFindFirst.mockResolvedValue({ ...BASE_COLLAB, userId: MOCK_USER_ID });
    mockDelete.mockResolvedValue(BASE_COLLAB);
    const req = makeRequest(`http://localhost/api/collaborations/${COLLAB_ID}`, {
      method: "DELETE",
    });
    const res = await deleteCollaboration(req, makeContext(COLLAB_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});

// ── GET /api/collaborations/[id]/performance ──────────────────────────────────

describe("GET /api/collaborations/[id]/performance", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest(`http://localhost/api/collaborations/${COLLAB_ID}/performance`);
    const res = await getPerformance(req, makeContext(COLLAB_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when collaboration not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const req = makeRequest(`http://localhost/api/collaborations/${COLLAB_ID}/performance`);
    const res = await getPerformance(req, makeContext(COLLAB_ID));
    expect(res.status).toBe(404);
  });
});
