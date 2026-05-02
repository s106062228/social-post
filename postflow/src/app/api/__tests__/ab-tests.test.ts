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
    postABTest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: Date.now() + 60000 }),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

import { NextRequest } from "next/server";
import { GET as listTests, POST as createTest } from "@/app/api/ab-tests/route";
import { GET as getTest, DELETE as deleteTest } from "@/app/api/ab-tests/[id]/route";
import { PATCH as concludeTest } from "@/app/api/ab-tests/[id]/conclude/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockFindMany = prisma.postABTest.findMany as jest.Mock;
const mockFindUnique = prisma.postABTest.findUnique as jest.Mock;
const mockCreate = prisma.postABTest.create as jest.Mock;
const mockUpdate = prisma.postABTest.update as jest.Mock;
const mockDelete = prisma.postABTest.delete as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const USER_ID = "user_cuid_111";
const OTHER_USER_ID = "user_cuid_999";
const TEST_ID = "test_cuid_abc";
const POST_A_ID = "post_cuid_aaa";
const POST_B_ID = "post_cuid_bbb";

const AUTHED_SESSION = { user: { id: USER_ID } };

const MOCK_POST_A = {
  id: POST_A_ID,
  content: "Post A content about summer sale",
  status: "PUBLISHED",
  mediaType: "NONE",
};

const MOCK_POST_B = {
  id: POST_B_ID,
  content: "Post B content about seasonal deals",
  status: "PUBLISHED",
  mediaType: "NONE",
};

const MOCK_TEST = {
  id: TEST_ID,
  userId: USER_ID,
  name: "CTA copy test",
  winner: null,
  notes: null,
  createdAt: new Date("2026-05-06T10:00:00Z"),
  updatedAt: new Date("2026-05-06T10:00:00Z"),
  postA: { ...MOCK_POST_A, publishResults: [] },
  postB: { ...MOCK_POST_B, publishResults: [] },
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonReq(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: Date.now() + 60000 });
});

// ── GET /api/ab-tests ─────────────────────────────────────────────────────────

describe("GET /api/ab-tests", () => {
  test("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listTests();
    expect(res.status).toBe(401);
  });

  test("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce({ success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 });
    const res = await listTests();
    expect(res.status).toBe(429);
  });

  test("returns empty list when no tests exist", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const res = await listTests();
    expect(res.status).toBe(200);
    const body = await res.json() as { tests: unknown[] };
    expect(body.tests).toHaveLength(0);
  });

  test("returns list of A/B tests for the user", async () => {
    mockFindMany.mockResolvedValueOnce([MOCK_TEST]);
    const res = await listTests();
    expect(res.status).toBe(200);
    const body = await res.json() as { tests: unknown[] };
    expect(body.tests).toHaveLength(1);
  });
});

// ── POST /api/ab-tests ────────────────────────────────────────────────────────

describe("POST /api/ab-tests", () => {
  test("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createTest(
      jsonReq("http://localhost/api/ab-tests", "POST", { name: "Test", postAId: POST_A_ID, postBId: POST_B_ID })
    );
    expect(res.status).toBe(401);
  });

  test("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce({ success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 });
    const res = await createTest(
      jsonReq("http://localhost/api/ab-tests", "POST", { name: "Test", postAId: POST_A_ID, postBId: POST_B_ID })
    );
    expect(res.status).toBe(429);
  });

  test("returns 400 for invalid input (missing name)", async () => {
    const res = await createTest(
      jsonReq("http://localhost/api/ab-tests", "POST", { postAId: POST_A_ID, postBId: POST_B_ID })
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 when postAId === postBId", async () => {
    const res = await createTest(
      jsonReq("http://localhost/api/ab-tests", "POST", { name: "Test", postAId: POST_A_ID, postBId: POST_A_ID })
    );
    expect(res.status).toBe(400);
  });

  test("returns 404 when variant A post not found", async () => {
    mockPostFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(MOCK_POST_B);
    const res = await createTest(
      jsonReq("http://localhost/api/ab-tests", "POST", { name: "Test", postAId: POST_A_ID, postBId: POST_B_ID })
    );
    expect(res.status).toBe(404);
  });

  test("returns 404 when variant B post not found", async () => {
    mockPostFindUnique.mockResolvedValueOnce(MOCK_POST_A).mockResolvedValueOnce(null);
    const res = await createTest(
      jsonReq("http://localhost/api/ab-tests", "POST", { name: "Test", postAId: POST_A_ID, postBId: POST_B_ID })
    );
    expect(res.status).toBe(404);
  });

  test("creates test and returns 201", async () => {
    mockPostFindUnique
      .mockResolvedValueOnce(MOCK_POST_A)
      .mockResolvedValueOnce(MOCK_POST_B);
    mockCreate.mockResolvedValueOnce(MOCK_TEST);
    const res = await createTest(
      jsonReq("http://localhost/api/ab-tests", "POST", { name: "CTA copy test", postAId: POST_A_ID, postBId: POST_B_ID })
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { test: { name: string } };
    expect(body.test.name).toBe("CTA copy test");
  });
});

// ── GET /api/ab-tests/[id] ────────────────────────────────────────────────────

describe("GET /api/ab-tests/[id]", () => {
  test("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID, "GET"),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(401);
  });

  test("returns 404 when test not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await getTest(
      jsonReq("http://localhost/api/ab-tests/nonexistent", "GET"),
      makeParams("nonexistent")
    );
    expect(res.status).toBe(404);
  });

  test("returns 403 when test belongs to another user", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...MOCK_TEST, userId: OTHER_USER_ID });
    const res = await getTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID, "GET"),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(403);
  });

  test("returns test detail for owner", async () => {
    mockFindUnique.mockResolvedValueOnce(MOCK_TEST);
    const res = await getTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID, "GET"),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { test: { id: string } };
    expect(body.test.id).toBe(TEST_ID);
  });
});

// ── DELETE /api/ab-tests/[id] ─────────────────────────────────────────────────

describe("DELETE /api/ab-tests/[id]", () => {
  test("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID, "DELETE"),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(401);
  });

  test("returns 404 when test not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await deleteTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID, "DELETE"),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(404);
  });

  test("returns 403 when test belongs to another user", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    const res = await deleteTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID, "DELETE"),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(403);
  });

  test("deletes test and returns success", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: USER_ID });
    mockDelete.mockResolvedValueOnce({});
    const res = await deleteTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID, "DELETE"),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });
});

// ── PATCH /api/ab-tests/[id]/conclude ────────────────────────────────────────

describe("PATCH /api/ab-tests/[id]/conclude", () => {
  test("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await concludeTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID + "/conclude", "PATCH", { winner: "A" }),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(401);
  });

  test("returns 404 when test not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await concludeTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID + "/conclude", "PATCH", { winner: "A" }),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(404);
  });

  test("returns 403 when test belongs to another user", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    const res = await concludeTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID + "/conclude", "PATCH", { winner: "A" }),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(403);
  });

  test("returns 400 for invalid winner value", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: USER_ID });
    const res = await concludeTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID + "/conclude", "PATCH", { winner: "INVALID" }),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(400);
  });

  test("concludes test with winner A", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: USER_ID });
    mockUpdate.mockResolvedValueOnce({ ...MOCK_TEST, winner: "A", notes: null });
    const res = await concludeTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID + "/conclude", "PATCH", { winner: "A" }),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { test: { winner: string } };
    expect(body.test.winner).toBe("A");
  });

  test("concludes test with winner B and notes", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: USER_ID });
    mockUpdate.mockResolvedValueOnce({ ...MOCK_TEST, winner: "B", notes: "B had better CTR" });
    const res = await concludeTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID + "/conclude", "PATCH", { winner: "B", notes: "B had better CTR" }),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { test: { winner: string; notes: string } };
    expect(body.test.winner).toBe("B");
    expect(body.test.notes).toBe("B had better CTR");
  });

  test("concludes test as INCONCLUSIVE", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: USER_ID });
    mockUpdate.mockResolvedValueOnce({ ...MOCK_TEST, winner: "INCONCLUSIVE", notes: "No clear winner" });
    const res = await concludeTest(
      jsonReq("http://localhost/api/ab-tests/" + TEST_ID + "/conclude", "PATCH", { winner: "INCONCLUSIVE", notes: "No clear winner" }),
      makeParams(TEST_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { test: { winner: string } };
    expect(body.test.winner).toBe("INCONCLUSIVE");
  });
});
