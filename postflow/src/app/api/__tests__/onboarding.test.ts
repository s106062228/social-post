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
    user: { findUnique: jest.fn(), update: jest.fn() },
    socialAccount: { count: jest.fn() },
    post: { count: jest.fn() },
    publishResult: { count: jest.fn() },
    postQueueSlot: { count: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { GET as getStatus } from "@/app/api/onboarding/status/route";
import { POST as postDismiss } from "@/app/api/onboarding/dismiss/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;
const mockAccountCount = prisma.socialAccount.count as jest.Mock;
const mockPostCount = prisma.post.count as jest.Mock;
const mockPublishedCount = prisma.publishResult.count as jest.Mock;
const mockQueueSlotCount = prisma.postQueueSlot.count as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeStatusRequest() {
  return new NextRequest("http://localhost:3000/api/onboarding/status");
}

function makeDismissRequest() {
  return new NextRequest("http://localhost:3000/api/onboarding/dismiss", {
    method: "POST",
  });
}

// ── GET /api/onboarding/status ────────────────────────────────────────────────

describe("GET /api/onboarding/status", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getStatus(makeStatusRequest());
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await getStatus(makeStatusRequest());
    expect(res.status).toBe(429);
  });

  it("returns 404 when user not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockAccountCount.mockResolvedValueOnce(0);
    mockPostCount.mockResolvedValueOnce(0);
    mockPublishedCount.mockResolvedValueOnce(0);
    mockQueueSlotCount.mockResolvedValueOnce(0);
    const res = await getStatus(makeStatusRequest());
    expect(res.status).toBe(404);
  });

  it("returns steps with all incomplete for brand-new user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce({ onboardingDismissed: false });
    mockAccountCount.mockResolvedValueOnce(0);
    mockPostCount.mockResolvedValueOnce(0);
    mockPublishedCount.mockResolvedValueOnce(0);
    mockQueueSlotCount.mockResolvedValueOnce(0);

    const res = await getStatus(makeStatusRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      steps: Array<{ id: string; completed: boolean }>;
      allComplete: boolean;
      dismissed: boolean;
    };

    expect(data.dismissed).toBe(false);
    expect(data.allComplete).toBe(false);
    expect(data.steps).toHaveLength(4);
    expect(data.steps.every((s) => !s.completed)).toBe(true);
    const ids = data.steps.map((s) => s.id);
    expect(ids).toContain("connect-account");
    expect(ids).toContain("create-post");
    expect(ids).toContain("publish-post");
    expect(ids).toContain("set-up-queue");
  });

  it("marks steps completed based on DB counts", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce({ onboardingDismissed: false });
    mockAccountCount.mockResolvedValueOnce(1);  // connected
    mockPostCount.mockResolvedValueOnce(3);     // posts created
    mockPublishedCount.mockResolvedValueOnce(0); // none published
    mockQueueSlotCount.mockResolvedValueOnce(0); // no queue slots

    const res = await getStatus(makeStatusRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      steps: Array<{ id: string; completed: boolean }>;
      allComplete: boolean;
    };

    const stepMap = Object.fromEntries(data.steps.map((s) => [s.id, s.completed]));
    expect(stepMap["connect-account"]).toBe(true);
    expect(stepMap["create-post"]).toBe(true);
    expect(stepMap["publish-post"]).toBe(false);
    expect(stepMap["set-up-queue"]).toBe(false);
    expect(data.allComplete).toBe(false);
  });

  it("sets allComplete=true when all steps are done", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce({ onboardingDismissed: false });
    mockAccountCount.mockResolvedValueOnce(2);
    mockPostCount.mockResolvedValueOnce(5);
    mockPublishedCount.mockResolvedValueOnce(1);
    mockQueueSlotCount.mockResolvedValueOnce(3);

    const res = await getStatus(makeStatusRequest());
    const data = (await res.json()) as { allComplete: boolean };
    expect(data.allComplete).toBe(true);
  });

  it("returns dismissed=true when user has dismissed onboarding", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce({ onboardingDismissed: true });
    mockAccountCount.mockResolvedValueOnce(0);
    mockPostCount.mockResolvedValueOnce(0);
    mockPublishedCount.mockResolvedValueOnce(0);
    mockQueueSlotCount.mockResolvedValueOnce(0);

    const res = await getStatus(makeStatusRequest());
    const data = (await res.json()) as { dismissed: boolean };
    expect(data.dismissed).toBe(true);
  });

  it("each step has label, description, and href fields", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserFindUnique.mockResolvedValueOnce({ onboardingDismissed: false });
    mockAccountCount.mockResolvedValueOnce(0);
    mockPostCount.mockResolvedValueOnce(0);
    mockPublishedCount.mockResolvedValueOnce(0);
    mockQueueSlotCount.mockResolvedValueOnce(0);

    const res = await getStatus(makeStatusRequest());
    const data = (await res.json()) as {
      steps: Array<{ label: string; description: string; href: string }>;
    };
    for (const step of data.steps) {
      expect(typeof step.label).toBe("string");
      expect(typeof step.description).toBe("string");
      expect(step.href).toMatch(/^\//);
    }
  });
});

// ── POST /api/onboarding/dismiss ──────────────────────────────────────────────

describe("POST /api/onboarding/dismiss", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await postDismiss(makeDismissRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await postDismiss(makeDismissRequest());
    expect(res.status).toBe(429);
  });

  it("updates user and returns dismissed=true", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockUserUpdate.mockResolvedValueOnce({ id: MOCK_USER_ID, onboardingDismissed: true });

    const res = await postDismiss(makeDismissRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { dismissed: boolean };
    expect(data.dismissed).toBe(true);

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: MOCK_USER_ID },
      data: { onboardingDismissed: true },
    });
  });
});
