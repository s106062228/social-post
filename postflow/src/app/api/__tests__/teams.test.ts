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
    teamMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    team: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    teamInvite: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { GET as listTeams, POST as createTeam } from "@/app/api/teams/route";
import {
  GET as getTeam,
  PATCH as updateTeam,
  DELETE as deleteTeam,
} from "@/app/api/teams/[id]/route";
import { GET as listMembers } from "@/app/api/teams/[id]/members/route";
import {
  PATCH as updateMemberRole,
  DELETE as removeMember,
} from "@/app/api/teams/[id]/members/[userId]/route";
import { POST as createInvite } from "@/app/api/teams/[id]/invite/route";
import { POST as acceptInvite } from "@/app/api/teams/accept-invite/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockTeamMemberFindMany = prisma.teamMember.findMany as jest.Mock;
const mockTeamMemberFindUnique = prisma.teamMember.findUnique as jest.Mock;
const mockTeamMemberCreate = prisma.teamMember.create as jest.Mock;
const mockTeamMemberUpdate = prisma.teamMember.update as jest.Mock;
const mockTeamMemberDelete = prisma.teamMember.delete as jest.Mock;
const mockTeamCreate = prisma.team.create as jest.Mock;
const mockTeamUpdate = prisma.team.update as jest.Mock;
const mockTeamDelete = prisma.team.delete as jest.Mock;
const mockTeamInviteCreate = prisma.teamInvite.create as jest.Mock;
const mockTeamInviteFindUnique = prisma.teamInvite.findUnique as jest.Mock;
const mockTeamInviteDelete = prisma.teamInvite.delete as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const USER_ID = "user_owner_001";
const OTHER_USER_ID = "user_other_999";
const TEAM_ID = "team_001";
const MEMBER_ID = "member_001";
const INVITE_TOKEN = "invite_token_abc";

const AUTHED = { user: { id: USER_ID, email: "owner@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const OWNER_MEMBERSHIP = { id: MEMBER_ID, teamId: TEAM_ID, userId: USER_ID, role: "OWNER" };
const ADMIN_MEMBERSHIP = { id: MEMBER_ID, teamId: TEAM_ID, userId: USER_ID, role: "ADMIN" };
const EDITOR_MEMBERSHIP = { id: MEMBER_ID, teamId: TEAM_ID, userId: USER_ID, role: "EDITOR" };
const VIEWER_MEMBERSHIP = { id: MEMBER_ID, teamId: TEAM_ID, userId: USER_ID, role: "VIEWER" };

const BASE_TEAM = {
  id: TEAM_ID,
  name: "Marketing",
  ownerId: USER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeTeamReq(method: string, body?: unknown, url = "http://localhost:3000/api/teams") {
  return new NextRequest(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeParams<T extends Record<string, string>>(obj: T) {
  return { params: Promise.resolve(obj) };
}

// ── GET /api/teams ────────────────────────────────────────────────────────────

describe("GET /api/teams", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listTeams();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);
    const res = await listTeams();
    expect(res.status).toBe(429);
  });

  it("returns list of teams with user role", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindMany.mockResolvedValueOnce([
      {
        teamId: TEAM_ID,
        role: "OWNER",
        createdAt: new Date(),
        team: { ...BASE_TEAM, _count: { members: 3 } },
      },
    ]);
    const res = await listTeams();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { teams: unknown[] };
    expect(data.teams).toHaveLength(1);
  });

  it("returns empty list when user has no teams", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindMany.mockResolvedValueOnce([]);
    const res = await listTeams();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { teams: unknown[] };
    expect(data.teams).toHaveLength(0);
  });
});

// ── POST /api/teams ───────────────────────────────────────────────────────────

describe("POST /api/teams", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createTeam(makeTeamReq("POST", { name: "Acme" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createTeam(makeTeamReq("POST", {}));
    expect(res.status).toBe(400);
  });

  it("returns 201 with created team", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTransaction.mockImplementationOnce(async (fn: (tx: typeof prisma) => unknown) => {
      mockTeamCreate.mockResolvedValueOnce(BASE_TEAM);
      mockTeamMemberCreate.mockResolvedValueOnce(OWNER_MEMBERSHIP);
      return fn(prisma);
    });
    const res = await createTeam(makeTeamReq("POST", { name: "Marketing" }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { role: string };
    expect(data.role).toBe("OWNER");
  });

  it("returns 400 for invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const req = new NextRequest("http://localhost:3000/api/teams", {
      method: "POST",
      body: "not-json",
    });
    const res = await createTeam(req);
    expect(res.status).toBe(400);
  });
});

// ── GET /api/teams/[id] ───────────────────────────────────────────────────────

describe("GET /api/teams/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getTeam(makeTeamReq("GET"), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when user is not a member", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(null);
    const res = await getTeam(makeTeamReq("GET"), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(404);
  });

  it("returns team details for member", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce({
      ...OWNER_MEMBERSHIP,
      team: {
        ...BASE_TEAM,
        members: [
          {
            id: MEMBER_ID,
            userId: USER_ID,
            role: "OWNER",
            createdAt: new Date(),
            user: { id: USER_ID, name: "Alice", email: "alice@example.com" },
          },
        ],
        invites: [],
      },
    });
    const res = await getTeam(makeTeamReq("GET"), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { members: unknown[] };
    expect(data.members).toHaveLength(1);
  });
});

// ── PATCH /api/teams/[id] ─────────────────────────────────────────────────────

describe("PATCH /api/teams/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateTeam(makeTeamReq("PATCH", { name: "New Name" }), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when requester is EDITOR", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(EDITOR_MEMBERSHIP);
    const res = await updateTeam(makeTeamReq("PATCH", { name: "New Name" }), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(403);
  });

  it("allows OWNER to rename team", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockTeamUpdate.mockResolvedValueOnce({ ...BASE_TEAM, name: "New Name" });
    const res = await updateTeam(makeTeamReq("PATCH", { name: "New Name" }), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { name: string };
    expect(data.name).toBe("New Name");
  });

  it("allows ADMIN to rename team", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(ADMIN_MEMBERSHIP);
    mockTeamUpdate.mockResolvedValueOnce({ ...BASE_TEAM, name: "Admin Rename" });
    const res = await updateTeam(makeTeamReq("PATCH", { name: "Admin Rename" }), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(200);
  });
});

// ── DELETE /api/teams/[id] ────────────────────────────────────────────────────

describe("DELETE /api/teams/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteTeam(makeTeamReq("DELETE"), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when requester is not OWNER", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(ADMIN_MEMBERSHIP);
    const res = await deleteTeam(makeTeamReq("DELETE"), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(403);
  });

  it("returns 204 when OWNER deletes team", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockTeamDelete.mockResolvedValueOnce(BASE_TEAM);
    const res = await deleteTeam(makeTeamReq("DELETE"), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(204);
  });

  it("returns 404 when user is not a member", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(null);
    const res = await deleteTeam(makeTeamReq("DELETE"), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(404);
  });
});

// ── GET /api/teams/[id]/members ───────────────────────────────────────────────

describe("GET /api/teams/[id]/members", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listMembers(makeTeamReq("GET"), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when user is not a member", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(null);
    const res = await listMembers(makeTeamReq("GET"), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(404);
  });

  it("returns members list for team member", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockTeamMemberFindMany.mockResolvedValueOnce([
      {
        id: MEMBER_ID,
        userId: USER_ID,
        role: "OWNER",
        createdAt: new Date(),
        user: { id: USER_ID, name: "Alice", email: "alice@example.com" },
      },
    ]);
    const res = await listMembers(makeTeamReq("GET"), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { members: unknown[] };
    expect(data.members).toHaveLength(1);
  });
});

// ── PATCH /api/teams/[id]/members/[userId] ────────────────────────────────────

describe("PATCH /api/teams/[id]/members/[userId]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateMemberRole(
      makeTeamReq("PATCH", { role: "EDITOR" }),
      makeParams({ id: TEAM_ID, userId: OTHER_USER_ID })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when requester is VIEWER", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(VIEWER_MEMBERSHIP);
    const res = await updateMemberRole(
      makeTeamReq("PATCH", { role: "EDITOR" }),
      makeParams({ id: TEAM_ID, userId: OTHER_USER_ID })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when trying to change OWNER role", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique
      .mockResolvedValueOnce(OWNER_MEMBERSHIP)
      .mockResolvedValueOnce({ ...OWNER_MEMBERSHIP, userId: OTHER_USER_ID, role: "OWNER" });
    const res = await updateMemberRole(
      makeTeamReq("PATCH", { role: "ADMIN" }),
      makeParams({ id: TEAM_ID, userId: OTHER_USER_ID })
    );
    expect(res.status).toBe(400);
  });

  it("allows OWNER to change EDITOR to ADMIN", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique
      .mockResolvedValueOnce(OWNER_MEMBERSHIP)
      .mockResolvedValueOnce({ id: "m2", teamId: TEAM_ID, userId: OTHER_USER_ID, role: "EDITOR" });
    mockTeamMemberUpdate.mockResolvedValueOnce({ userId: OTHER_USER_ID, role: "ADMIN" });
    const res = await updateMemberRole(
      makeTeamReq("PATCH", { role: "ADMIN" }),
      makeParams({ id: TEAM_ID, userId: OTHER_USER_ID })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { role: string };
    expect(data.role).toBe("ADMIN");
  });

  it("returns 400 for invalid role value", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    const res = await updateMemberRole(
      makeTeamReq("PATCH", { role: "OWNER" }),
      makeParams({ id: TEAM_ID, userId: OTHER_USER_ID })
    );
    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/teams/[id]/members/[userId] ───────────────────────────────────

describe("DELETE /api/teams/[id]/members/[userId]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await removeMember(
      makeTeamReq("DELETE"),
      makeParams({ id: TEAM_ID, userId: OTHER_USER_ID })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when trying to remove the OWNER", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique
      .mockResolvedValueOnce(OWNER_MEMBERSHIP)
      .mockResolvedValueOnce({ ...OWNER_MEMBERSHIP, userId: OTHER_USER_ID, role: "OWNER" });
    const res = await removeMember(
      makeTeamReq("DELETE"),
      makeParams({ id: TEAM_ID, userId: OTHER_USER_ID })
    );
    expect(res.status).toBe(400);
  });

  it("allows OWNER to remove EDITOR", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique
      .mockResolvedValueOnce(OWNER_MEMBERSHIP)
      .mockResolvedValueOnce({ id: "m2", teamId: TEAM_ID, userId: OTHER_USER_ID, role: "EDITOR" });
    mockTeamMemberDelete.mockResolvedValueOnce({});
    const res = await removeMember(
      makeTeamReq("DELETE"),
      makeParams({ id: TEAM_ID, userId: OTHER_USER_ID })
    );
    expect(res.status).toBe(204);
  });

  it("allows EDITOR to leave team (self)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique
      .mockResolvedValueOnce(EDITOR_MEMBERSHIP)
      .mockResolvedValueOnce(EDITOR_MEMBERSHIP);
    mockTeamMemberDelete.mockResolvedValueOnce({});
    const res = await removeMember(
      makeTeamReq("DELETE"),
      makeParams({ id: TEAM_ID, userId: USER_ID })
    );
    expect(res.status).toBe(204);
  });
});

// ── POST /api/teams/[id]/invite ───────────────────────────────────────────────

describe("POST /api/teams/[id]/invite", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createInvite(makeTeamReq("POST", { role: "EDITOR" }), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when requester is VIEWER", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(VIEWER_MEMBERSHIP);
    const res = await createInvite(makeTeamReq("POST", { role: "EDITOR" }), makeParams({ id: TEAM_ID }));
    expect(res.status).toBe(403);
  });

  it("returns 201 with invite token for OWNER", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockTeamInviteCreate.mockResolvedValueOnce({
      id: "inv_001",
      token: INVITE_TOKEN,
      email: "new@example.com",
      role: "EDITOR",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const res = await createInvite(
      makeTeamReq("POST", { email: "new@example.com", role: "EDITOR" }),
      makeParams({ id: TEAM_ID })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { token: string };
    expect(data.token).toBe(INVITE_TOKEN);
  });

  it("creates invite without email", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamMemberFindUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockTeamInviteCreate.mockResolvedValueOnce({
      id: "inv_002",
      token: INVITE_TOKEN,
      email: null,
      role: "EDITOR",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const res = await createInvite(
      makeTeamReq("POST", { role: "EDITOR" }),
      makeParams({ id: TEAM_ID })
    );
    expect(res.status).toBe(201);
  });
});

// ── POST /api/teams/accept-invite ─────────────────────────────────────────────

describe("POST /api/teams/accept-invite", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await acceptInvite(makeTeamReq("POST", { token: INVITE_TOKEN }));
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown token", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamInviteFindUnique.mockResolvedValueOnce(null);
    const res = await acceptInvite(makeTeamReq("POST", { token: "bad_token" }));
    expect(res.status).toBe(404);
  });

  it("returns 410 for expired invite", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamInviteFindUnique.mockResolvedValueOnce({
      id: "inv_001",
      token: INVITE_TOKEN,
      teamId: TEAM_ID,
      role: "EDITOR",
      expiresAt: new Date(Date.now() - 1000),
    });
    mockTeamInviteDelete.mockResolvedValueOnce({});
    const res = await acceptInvite(makeTeamReq("POST", { token: INVITE_TOKEN }));
    expect(res.status).toBe(410);
  });

  it("returns 409 when already a member", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamInviteFindUnique.mockResolvedValueOnce({
      id: "inv_001",
      token: INVITE_TOKEN,
      teamId: TEAM_ID,
      role: "EDITOR",
      expiresAt: new Date(Date.now() + 86400000),
    });
    mockTeamMemberFindUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    const res = await acceptInvite(makeTeamReq("POST", { token: INVITE_TOKEN }));
    expect(res.status).toBe(409);
  });

  it("returns 201 on successful invite acceptance", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockTeamInviteFindUnique.mockResolvedValueOnce({
      id: "inv_001",
      token: INVITE_TOKEN,
      teamId: TEAM_ID,
      role: "EDITOR",
      expiresAt: new Date(Date.now() + 86400000),
    });
    mockTeamMemberFindUnique.mockResolvedValueOnce(null);
    mockTransaction.mockImplementationOnce(async (fn: (tx: typeof prisma) => unknown) => {
      mockTeamMemberCreate.mockResolvedValueOnce({ teamId: TEAM_ID, role: "EDITOR" });
      mockTeamInviteDelete.mockResolvedValueOnce({});
      return fn(prisma);
    });
    const res = await acceptInvite(makeTeamReq("POST", { token: INVITE_TOKEN }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { teamId: string; role: string };
    expect(data.teamId).toBe(TEAM_ID);
    expect(data.role).toBe("EDITOR");
  });

  it("returns 400 for missing token field", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await acceptInvite(makeTeamReq("POST", {}));
    expect(res.status).toBe(400);
  });
});
