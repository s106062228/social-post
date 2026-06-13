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
    influencerProfile: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    collaboration: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { GET as listProfiles, POST as createProfile } from "@/app/api/influencer-profiles/route";
import {
  PATCH as updateProfile,
  DELETE as deleteProfile,
} from "@/app/api/influencer-profiles/[id]/route";
import { POST as createCollaboration } from "@/app/api/influencer-profiles/[id]/create-collaboration/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFindMany = prisma.influencerProfile.findMany as jest.Mock;
const mockFindUnique = prisma.influencerProfile.findUnique as jest.Mock;
const mockCreate = prisma.influencerProfile.create as jest.Mock;
const mockUpdate = prisma.influencerProfile.update as jest.Mock;
const mockCount = prisma.influencerProfile.count as jest.Mock;
const mockDelete = prisma.influencerProfile.delete as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const MOCK_USER_ID = "user_abc123";
const OTHER_USER_ID = "user_other456";
const PROFILE_ID = "profile_xyz789";

const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_PROFILE = {
  id: PROFILE_ID,
  userId: MOCK_USER_ID,
  name: "Jane Doe",
  handle: "@janedoe",
  platform: "INSTAGRAM",
  followerCount: 50000,
  engagementRate: 3.5,
  niche: "Fashion",
  email: "jane@example.com",
  profileUrl: "https://instagram.com/janedoe",
  outreachStatus: "PROSPECT",
  notes: null,
  lastContactedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeGetRequest(qs = ""): NextRequest {
  return new NextRequest(`http://localhost:3000/api/influencer-profiles${qs}`);
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/influencer-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/influencer-profiles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/influencer-profiles/${id}`, {
    method: "DELETE",
  });
}

function makeCreateCollabRequest(): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/influencer-profiles/${PROFILE_ID}/create-collaboration`,
    { method: "POST" }
  );
}

// ── GET /api/influencer-profiles ─────────────────────────────────────────────

describe("GET /api/influencer-profiles", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listProfiles(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);
    const res = await listProfiles(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it("returns empty profiles list", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await listProfiles(makeGetRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { profiles: unknown[] };
    expect(data.profiles).toEqual([]);
  });

  it("returns profiles with expected shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await listProfiles(makeGetRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { profiles: typeof BASE_PROFILE[] };
    expect(data.profiles).toHaveLength(1);
    expect(data.profiles[0].name).toBe("Jane Doe");
    expect(data.profiles[0].handle).toBe("@janedoe");
    expect(data.profiles[0].outreachStatus).toBe("PROSPECT");
  });

  it("passes status filter to DB query", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindMany.mockResolvedValueOnce([]);
    await listProfiles(makeGetRequest("?status=CONTACTED"));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ outreachStatus: "CONTACTED" }),
      })
    );
  });
});

// ── POST /api/influencer-profiles ────────────────────────────────────────────

describe("POST /api/influencer-profiles", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createProfile(makePostRequest({ name: "Jane", handle: "@jane" }));
    expect(res.status).toBe(401);
  });

  it("returns 409 when max profiles reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockCount.mockResolvedValueOnce(500);
    const res = await createProfile(makePostRequest({ name: "Jane", handle: "@jane" }));
    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid body (missing required fields)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createProfile(makePostRequest({ name: "Jane" })); // missing handle
    expect(res.status).toBe(400);
  });

  it("creates profile and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce(BASE_PROFILE);
    const res = await createProfile(makePostRequest({ name: "Jane Doe", handle: "@janedoe" }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string };
    expect(data.id).toBe(PROFILE_ID);
  });
});

// ── PATCH /api/influencer-profiles/[id] ──────────────────────────────────────

describe("PATCH /api/influencer-profiles/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateProfile(
      makePatchRequest(PROFILE_ID, { outreachStatus: "CONTACTED" }),
      { params: Promise.resolve({ id: PROFILE_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when profile belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    const res = await updateProfile(
      makePatchRequest(PROFILE_ID, { outreachStatus: "CONTACTED" }),
      { params: Promise.resolve({ id: PROFILE_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it("updates profile successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockUpdate.mockResolvedValueOnce({ ...BASE_PROFILE, outreachStatus: "CONTACTED" });
    const res = await updateProfile(
      makePatchRequest(PROFILE_ID, { outreachStatus: "CONTACTED" }),
      { params: Promise.resolve({ id: PROFILE_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { outreachStatus: string };
    expect(data.outreachStatus).toBe("CONTACTED");
  });
});

// ── DELETE /api/influencer-profiles/[id] ─────────────────────────────────────

describe("DELETE /api/influencer-profiles/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when profile belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    const res = await deleteProfile(
      makeDeleteRequest(PROFILE_ID),
      { params: Promise.resolve({ id: PROFILE_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it("deletes profile and returns 204", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce({ userId: MOCK_USER_ID });
    mockDelete.mockResolvedValueOnce({});
    const res = await deleteProfile(
      makeDeleteRequest(PROFILE_ID),
      { params: Promise.resolve({ id: PROFILE_ID }) }
    );
    expect(res.status).toBe(204);
  });
});

// ── POST /api/influencer-profiles/[id]/create-collaboration ─────────────────

describe("POST /api/influencer-profiles/[id]/create-collaboration", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createCollaboration(makeCreateCollabRequest(), {
      params: Promise.resolve({ id: PROFILE_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when profile belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PROFILE, userId: OTHER_USER_ID });
    const res = await createCollaboration(makeCreateCollabRequest(), {
      params: Promise.resolve({ id: PROFILE_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("creates collaboration and returns 201 with collaborationId", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockFindUnique.mockResolvedValueOnce(BASE_PROFILE);
    mockTransaction.mockResolvedValueOnce([
      { id: "collab_001" },
      { ...BASE_PROFILE, outreachStatus: "AGREED" },
    ]);
    const res = await createCollaboration(makeCreateCollabRequest(), {
      params: Promise.resolve({ id: PROFILE_ID }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { collaborationId: string };
    expect(data.collaborationId).toBe("collab_001");
  });
});
