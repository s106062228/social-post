jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    postSequence: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    sequenceStep: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    post: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    socialAccount: {
      findFirst: jest.fn(),
    },
    publishResult: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/activity-log", () => ({
  logActivity: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET as getSequences, POST as postSequences } from "@/app/api/sequences/route";
import { GET as getById, PATCH as patchById, DELETE as deleteById } from "@/app/api/sequences/[id]/route";
import { GET as getSteps, POST as postSteps } from "@/app/api/sequences/[id]/steps/route";
import { POST as startSequence } from "@/app/api/sequences/[id]/start/route";
import { POST as pauseSequence } from "@/app/api/sequences/[id]/pause/route";
import { POST as cancelSequence } from "@/app/api/sequences/[id]/cancel/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const AUTHED = { user: { id: "user-1", email: "user@test.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const mockSeq = {
  id: "seq-1",
  userId: "user-1",
  name: "Test Sequence",
  description: null,
  status: "DRAFT",
  startDate: null,
  timezone: "UTC",
  steps: [],
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const mockStep = {
  id: "step-1",
  sequenceId: "seq-1",
  stepOrder: 0,
  delayDays: 0,
  content: "Step 1 content",
  mediaType: "NONE",
  mediaUrls: [],
  platforms: [],
  postId: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const seqParams = (id = "seq-1") => ({ params: Promise.resolve({ id }) });
const stepParams = (id = "seq-1", stepId = "step-1") => ({
  params: Promise.resolve({ id, stepId }),
});

describe("GET /api/sequences", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getSequences(req("GET", "http://localhost/api/sequences"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await getSequences(req("GET", "http://localhost/api/sequences"));
    expect(res.status).toBe(429);
  });

  it("returns sequences list", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findMany as jest.Mock).mockResolvedValueOnce([mockSeq]);
    const res = await getSequences(req("GET", "http://localhost/api/sequences"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sequences).toHaveLength(1);
    expect(data.sequences[0].name).toBe("Test Sequence");
  });

  it("returns empty array when no sequences", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findMany as jest.Mock).mockResolvedValueOnce([]);
    const res = await getSequences(req("GET", "http://localhost/api/sequences"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sequences).toHaveLength(0);
  });
});

describe("POST /api/sequences", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await postSequences(
      req("POST", "http://localhost/api/sequences", { name: "Test" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await postSequences(
      req("POST", "http://localhost/api/sequences", { name: "Test" })
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 when max limit reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.count as jest.Mock).mockResolvedValueOnce(50);
    const res = await postSequences(
      req("POST", "http://localhost/api/sequences", { name: "Test" })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/50/);
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.count as jest.Mock).mockResolvedValueOnce(0);
    const res = await postSequences(req("POST", "http://localhost/api/sequences", {}));
    expect(res.status).toBe(400);
  });

  it("creates sequence and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.count as jest.Mock).mockResolvedValueOnce(0);
    (prisma.postSequence.create as jest.Mock).mockResolvedValueOnce(mockSeq);
    const res = await postSequences(
      req("POST", "http://localhost/api/sequences", { name: "Test Sequence" })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.sequence.name).toBe("Test Sequence");
  });
});

describe("PATCH /api/sequences/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await patchById(
      req("PATCH", "http://localhost/api/sequences/seq-1", { name: "Updated" }),
      seqParams()
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when sequence not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await patchById(
      req("PATCH", "http://localhost/api/sequences/seq-1", { name: "Updated" }),
      seqParams()
    );
    expect(res.status).toBe(404);
  });

  it("updates sequence successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce(mockSeq);
    (prisma.postSequence.update as jest.Mock).mockResolvedValueOnce({
      ...mockSeq,
      name: "Updated Name",
    });
    const res = await patchById(
      req("PATCH", "http://localhost/api/sequences/seq-1", { name: "Updated Name" }),
      seqParams()
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sequence.name).toBe("Updated Name");
  });
});

describe("DELETE /api/sequences/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteById(
      req("DELETE", "http://localhost/api/sequences/seq-1"),
      seqParams()
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await deleteById(
      req("DELETE", "http://localhost/api/sequences/seq-1"),
      seqParams()
    );
    expect(res.status).toBe(404);
  });

  it("deletes sequence and returns 204", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce(mockSeq);
    (prisma.postSequence.delete as jest.Mock).mockResolvedValueOnce({});
    const res = await deleteById(
      req("DELETE", "http://localhost/api/sequences/seq-1"),
      seqParams()
    );
    expect(res.status).toBe(204);
  });
});

describe("POST /api/sequences/[id]/steps", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await postSteps(
      req("POST", "http://localhost/api/sequences/seq-1/steps", { content: "Step" }),
      seqParams()
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when sequence not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await postSteps(
      req("POST", "http://localhost/api/sequences/seq-1/steps", { content: "Step" }),
      seqParams()
    );
    expect(res.status).toBe(404);
  });

  it("creates step and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce(mockSeq);
    (prisma.sequenceStep.count as jest.Mock).mockResolvedValueOnce(0);
    (prisma.sequenceStep.create as jest.Mock).mockResolvedValueOnce(mockStep);
    const res = await postSteps(
      req("POST", "http://localhost/api/sequences/seq-1/steps", {
        content: "Step 1 content",
        delayDays: 0,
      }),
      seqParams()
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.step.content).toBe("Step 1 content");
  });

  it("returns 400 when step limit reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce(mockSeq);
    (prisma.sequenceStep.count as jest.Mock).mockResolvedValueOnce(50);
    const res = await postSteps(
      req("POST", "http://localhost/api/sequences/seq-1/steps", { content: "Step" }),
      seqParams()
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/sequences/[id]/start", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await startSequence(
      req("POST", "http://localhost/api/sequences/seq-1/start", {
        startDate: "2026-01-01T10:00:00Z",
      }),
      seqParams()
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await startSequence(
      req("POST", "http://localhost/api/sequences/seq-1/start", {
        startDate: "2026-01-01T10:00:00Z",
      }),
      seqParams()
    );
    expect(res.status).toBe(429);
  });

  it("returns 404 when sequence not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await startSequence(
      req("POST", "http://localhost/api/sequences/seq-1/start", {
        startDate: "2026-01-01T10:00:00Z",
      }),
      seqParams()
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when sequence has no steps", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce({
      ...mockSeq,
      steps: [],
    });
    const res = await startSequence(
      req("POST", "http://localhost/api/sequences/seq-1/start", {
        startDate: "2026-01-01T10:00:00Z",
      }),
      seqParams()
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/no steps/i);
  });

  it("returns 409 when sequence already active", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce({
      ...mockSeq,
      status: "ACTIVE",
      steps: [mockStep],
    });
    const res = await startSequence(
      req("POST", "http://localhost/api/sequences/seq-1/start", {
        startDate: "2026-01-01T10:00:00Z",
      }),
      seqParams()
    );
    expect(res.status).toBe(409);
  });

  it("starts sequence and creates posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce({
      ...mockSeq,
      steps: [mockStep],
    });
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: (tx: typeof prisma) => Promise<void>) => {
      await fn({
        ...prisma,
        post: { create: jest.fn().mockResolvedValue({ id: "post-1" }) },
        sequenceStep: { update: jest.fn() },
        socialAccount: { findFirst: jest.fn().mockResolvedValue(null) },
        publishResult: { create: jest.fn() },
        postSequence: { update: jest.fn() },
      } as unknown as typeof prisma);
    });
    const res = await startSequence(
      req("POST", "http://localhost/api/sequences/seq-1/start", {
        startDate: "2026-01-01T10:00:00Z",
      }),
      seqParams()
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Sequence started");
    expect(typeof data.postsCreated).toBe("number");
  });
});

describe("POST /api/sequences/[id]/pause", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await pauseSequence(
      req("POST", "http://localhost/api/sequences/seq-1/pause"),
      seqParams()
    );
    expect(res.status).toBe(401);
  });

  it("returns 409 when sequence is not active", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce({
      ...mockSeq,
      status: "DRAFT",
    });
    const res = await pauseSequence(
      req("POST", "http://localhost/api/sequences/seq-1/pause"),
      seqParams()
    );
    expect(res.status).toBe(409);
  });

  it("pauses active sequence", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce({
      ...mockSeq,
      status: "ACTIVE",
    });
    (prisma.postSequence.update as jest.Mock).mockResolvedValueOnce({
      ...mockSeq,
      status: "PAUSED",
    });
    const res = await pauseSequence(
      req("POST", "http://localhost/api/sequences/seq-1/pause"),
      seqParams()
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sequence.status).toBe("PAUSED");
  });
});

describe("POST /api/sequences/[id]/cancel", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await cancelSequence(
      req("POST", "http://localhost/api/sequences/seq-1/cancel"),
      seqParams()
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when sequence not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await cancelSequence(
      req("POST", "http://localhost/api/sequences/seq-1/cancel"),
      seqParams()
    );
    expect(res.status).toBe(404);
  });

  it("cancels sequence and reverts scheduled posts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce({
      ...mockSeq,
      status: "ACTIVE",
      steps: [{ ...mockStep, postId: "post-1" }],
    });
    (prisma.$transaction as jest.Mock).mockResolvedValueOnce([]);
    const res = await cancelSequence(
      req("POST", "http://localhost/api/sequences/seq-1/cancel"),
      seqParams()
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Sequence cancelled");
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("returns 409 when already cancelled", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    (prisma.postSequence.findFirst as jest.Mock).mockResolvedValueOnce({
      ...mockSeq,
      status: "CANCELLED",
      steps: [],
    });
    const res = await cancelSequence(
      req("POST", "http://localhost/api/sequences/seq-1/cancel"),
      seqParams()
    );
    expect(res.status).toBe(409);
  });
});
