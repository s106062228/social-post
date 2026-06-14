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
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/posts/[id]/sponsor/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockPostUpdate = prisma.post.update as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

function makeRequest(postId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/sponsor`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/posts/[id]/sponsor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { isSponsored: true, sponsorName: "Acme" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce({ success: false });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { isSponsored: true, sponsorName: "Acme" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(429);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 404 for invalid (non-CUID) post ID", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await PATCH(makeRequest("not-a-cuid", { isSponsored: true, sponsorName: "Acme" }), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body (missing isSponsored)", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { sponsorName: "Acme" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when isSponsored=true but no sponsor name or disclosure text", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { isSponsored: true }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/require/i);
  });

  // ── Ownership ─────────────────────────────────────────────────────────────

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: OTHER_USER_ID });

    const res = await PATCH(makeRequest(MOCK_POST_ID, { isSponsored: true, sponsorName: "Acme" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when post does not exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest(MOCK_POST_ID, { isSponsored: true, sponsorName: "Acme" }), {
      params: Promise.resolve({ id: MOCK_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  // ── Set sponsored with sponsor name ──────────────────────────────────────

  it("marks post as sponsored with sponsor name", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: MOCK_USER_ID });
    mockPostUpdate.mockResolvedValueOnce({
      isSponsored: true,
      sponsorName: "Acme Corp",
      disclosureText: null,
    });

    const res = await PATCH(
      makeRequest(MOCK_POST_ID, { isSponsored: true, sponsorName: "Acme Corp" }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isSponsored: boolean; sponsorName: string | null; disclosureText: string | null };
    expect(data.isSponsored).toBe(true);
    expect(data.sponsorName).toBe("Acme Corp");
    expect(data.disclosureText).toBeNull();

    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isSponsored: true, sponsorName: "Acme Corp", disclosureText: null },
      })
    );
  });

  // ── Set sponsored with disclosure text ───────────────────────────────────

  it("marks post as sponsored with disclosure text only", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: MOCK_USER_ID });
    mockPostUpdate.mockResolvedValueOnce({
      isSponsored: true,
      sponsorName: null,
      disclosureText: "#ad",
    });

    const res = await PATCH(
      makeRequest(MOCK_POST_ID, { isSponsored: true, disclosureText: "#ad" }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isSponsored: boolean; sponsorName: string | null; disclosureText: string | null };
    expect(data.isSponsored).toBe(true);
    expect(data.disclosureText).toBe("#ad");
    expect(data.sponsorName).toBeNull();
  });

  // ── Clear sponsor ─────────────────────────────────────────────────────────

  it("clears sponsor info when isSponsored=false", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: MOCK_USER_ID });
    mockPostUpdate.mockResolvedValueOnce({
      isSponsored: false,
      sponsorName: null,
      disclosureText: null,
    });

    const res = await PATCH(
      makeRequest(MOCK_POST_ID, { isSponsored: false }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isSponsored: boolean; sponsorName: string | null; disclosureText: string | null };
    expect(data.isSponsored).toBe(false);
    expect(data.sponsorName).toBeNull();
    expect(data.disclosureText).toBeNull();

    // sponsorName and disclosureText are cleared to null when unsponsoring
    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isSponsored: false, sponsorName: null, disclosureText: null },
      })
    );
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 on unexpected database error", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockPostFindUnique.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await PATCH(
      makeRequest(MOCK_POST_ID, { isSponsored: true, sponsorName: "Acme" }),
      { params: Promise.resolve({ id: MOCK_POST_ID }) }
    );
    expect(res.status).toBe(500);
  });
});
