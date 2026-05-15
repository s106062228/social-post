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
    accountGroup: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    socialAccount: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listGroups, POST as createGroup } from "@/app/api/account-groups/route";
import {
  PATCH as updateGroup,
  DELETE as deleteGroup,
} from "@/app/api/account-groups/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGroupFindMany = prisma.accountGroup.findMany as jest.Mock;
const mockGroupFindUnique = prisma.accountGroup.findUnique as jest.Mock;
const mockGroupCreate = prisma.accountGroup.create as jest.Mock;
const mockGroupUpdate = prisma.accountGroup.update as jest.Mock;
const mockGroupCount = prisma.accountGroup.count as jest.Mock;
const mockGroupDelete = prisma.accountGroup.delete as jest.Mock;
const mockSocialAccountFindMany = prisma.socialAccount.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const VALID_GROUP_ID = "clh3ck8zp0001qr5hyvxckahk";
const VALID_ACCOUNT_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_GROUP = {
  id: VALID_GROUP_ID,
  userId: MOCK_USER_ID,
  name: "Personal Brand",
  accountIds: [VALID_ACCOUNT_ID],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/account-groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/account-groups/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/account-groups/${id}`, {
    method: "DELETE",
  });
}

// ── GET /api/account-groups ───────────────────────────────────────────────────

describe("GET /api/account-groups", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listGroups();
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listGroups();
    expect(res.status).toBe(429);
  });

  it("returns empty groups array when none exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindMany.mockResolvedValueOnce([]);

    const res = await listGroups();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { groups: unknown[] };
    expect(Array.isArray(data.groups)).toBe(true);
    expect(data.groups).toHaveLength(0);
  });

  it("returns groups with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindMany.mockResolvedValueOnce([BASE_GROUP]);

    const res = await listGroups();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { groups: typeof BASE_GROUP[] };
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].name).toBe("Personal Brand");
    expect(data.groups[0].accountIds).toEqual([VALID_ACCOUNT_ID]);
  });
});

// ── POST /api/account-groups ──────────────────────────────────────────────────

describe("POST /api/account-groups", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createGroup(makePostRequest({ name: "Brand", accountIds: [] }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createGroup(makePostRequest({ name: "Brand", accountIds: [] }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await createGroup(makePostRequest({ accountIds: [] }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation failed");
  });

  it("returns 422 when max group limit reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupCount.mockResolvedValueOnce(20);

    const res = await createGroup(makePostRequest({ name: "One More", accountIds: [] }));
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Maximum/);
  });

  it("returns 400 when accountId does not belong to user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupCount.mockResolvedValueOnce(0);
    mockSocialAccountFindMany.mockResolvedValueOnce([]); // none owned

    const res = await createGroup(
      makePostRequest({ name: "Brand", accountIds: ["foreign-account-id-123"] })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/do not belong/);
  });

  it("creates group with no accounts and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupCount.mockResolvedValueOnce(0);
    mockGroupCreate.mockResolvedValueOnce({ ...BASE_GROUP, accountIds: [] });

    const res = await createGroup(makePostRequest({ name: "Personal Brand", accountIds: [] }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_GROUP;
    expect(data.name).toBe("Personal Brand");
  });

  it("creates group with valid accountIds and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupCount.mockResolvedValueOnce(2);
    mockSocialAccountFindMany.mockResolvedValueOnce([{ id: VALID_ACCOUNT_ID }]);
    mockGroupCreate.mockResolvedValueOnce(BASE_GROUP);

    const res = await createGroup(
      makePostRequest({ name: "Personal Brand", accountIds: [VALID_ACCOUNT_ID] })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_GROUP;
    expect(data.accountIds).toContain(VALID_ACCOUNT_ID);
  });
});

// ── PATCH /api/account-groups/[id] ───────────────────────────────────────────

describe("PATCH /api/account-groups/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateGroup(makePatchRequest(VALID_GROUP_ID, { name: "Updated" }), {
      params: Promise.resolve({ id: VALID_GROUP_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await updateGroup(makePatchRequest(VALID_GROUP_ID, { name: "Updated" }), {
      params: Promise.resolve({ id: VALID_GROUP_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when group belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindUnique.mockResolvedValueOnce({ ...BASE_GROUP, userId: OTHER_USER_ID });

    const res = await updateGroup(makePatchRequest(VALID_GROUP_ID, { name: "Updated" }), {
      params: Promise.resolve({ id: VALID_GROUP_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("updates group name and returns 200", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindUnique.mockResolvedValueOnce(BASE_GROUP);
    mockGroupUpdate.mockResolvedValueOnce({ ...BASE_GROUP, name: "Work Accounts" });

    const res = await updateGroup(makePatchRequest(VALID_GROUP_ID, { name: "Work Accounts" }), {
      params: Promise.resolve({ id: VALID_GROUP_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof BASE_GROUP;
    expect(data.name).toBe("Work Accounts");
  });
});

// ── DELETE /api/account-groups/[id] ──────────────────────────────────────────

describe("DELETE /api/account-groups/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteGroup(makeDeleteRequest(VALID_GROUP_ID), {
      params: Promise.resolve({ id: VALID_GROUP_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deleteGroup(makeDeleteRequest(VALID_GROUP_ID), {
      params: Promise.resolve({ id: VALID_GROUP_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 for short/invalid ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    const res = await deleteGroup(makeDeleteRequest("bad"), {
      params: Promise.resolve({ id: "bad" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when group belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindUnique.mockResolvedValueOnce({ ...BASE_GROUP, userId: OTHER_USER_ID });

    const res = await deleteGroup(makeDeleteRequest(VALID_GROUP_ID), {
      params: Promise.resolve({ id: VALID_GROUP_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGroupFindUnique.mockResolvedValueOnce(BASE_GROUP);
    mockGroupDelete.mockResolvedValueOnce(BASE_GROUP);

    const res = await deleteGroup(makeDeleteRequest(VALID_GROUP_ID), {
      params: Promise.resolve({ id: VALID_GROUP_ID }),
    });
    expect(res.status).toBe(204);
  });
});
