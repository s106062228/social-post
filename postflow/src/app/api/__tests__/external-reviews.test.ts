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
    post: {
      findUnique: jest.fn(),
    },
    externalReview: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn().mockResolvedValue({ success: true }),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/lib/activity-log", () => ({
  logActivity: jest.fn(),
}));

jest.mock("@/lib/notifications", () => ({
  createNotification: jest.fn(),
  NOTIFICATION_TYPES: {
    EXTERNAL_REVIEW_RESPONDED: "external_review.responded",
    EXTERNAL_REVIEW_REQUESTED: "external_review.requested",
  },
}));

import { NextRequest } from "next/server";
import {
  GET as listGET,
  POST as createPOST,
} from "@/app/api/posts/[id]/external-reviews/route";
import { DELETE as cancelDELETE } from "@/app/api/posts/[id]/external-reviews/[reviewId]/route";
import { GET as publicGET } from "@/app/api/external-review/[token]/route";
import { POST as respondPOST } from "@/app/api/external-review/[token]/respond/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockReviewFindMany = prisma.externalReview.findMany as jest.Mock;
const mockReviewFindUnique = prisma.externalReview.findUnique as jest.Mock;
const mockReviewCreate = prisma.externalReview.create as jest.Mock;
const mockReviewUpdate = prisma.externalReview.update as jest.Mock;

const MOCK_USER_ID = "cltest000000000000000000a";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const POST_ID = "cltest000000000000000000b";
const REVIEW_ID = "cltest000000000000000000c";
const REVIEW_TOKEN = "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";

const SAMPLE_POST = {
  id: POST_ID,
  userId: MOCK_USER_ID,
  content: "Test post content",
  mediaType: "NONE",
  mediaUrls: [],
  status: "DRAFT",
};

const SAMPLE_REVIEW = {
  id: REVIEW_ID,
  postId: POST_ID,
  userId: MOCK_USER_ID,
  reviewerEmail: "reviewer@example.com",
  reviewerName: "Test Reviewer",
  token: REVIEW_TOKEN,
  message: "Please review this post",
  status: "PENDING",
  feedback: null,
  respondedAt: null,
  expiresAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

function makeRequest(url: string, method = "GET", body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new NextRequest(url, init);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── POST /api/posts/[id]/external-reviews ─────────────────────────────────────

describe("POST /api/posts/[id]/external-reviews", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await createPOST(
      makeRequest(`http://localhost/api/posts/${POST_ID}/external-reviews`, "POST", {
        reviewerEmail: "reviewer@example.com",
      }),
      { params: Promise.resolve({ id: POST_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when post not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue(null);
    const res = await createPOST(
      makeRequest(`http://localhost/api/posts/${POST_ID}/external-reviews`, "POST", {
        reviewerEmail: "reviewer@example.com",
      }),
      { params: Promise.resolve({ id: POST_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when post belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ id: POST_ID, userId: "other-user" });
    const res = await createPOST(
      makeRequest(`http://localhost/api/posts/${POST_ID}/external-reviews`, "POST", {
        reviewerEmail: "reviewer@example.com",
      }),
      { params: Promise.resolve({ id: POST_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ id: POST_ID, userId: MOCK_USER_ID });
    const res = await createPOST(
      makeRequest(`http://localhost/api/posts/${POST_ID}/external-reviews`, "POST", {
        reviewerEmail: "not-an-email",
      }),
      { params: Promise.resolve({ id: POST_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("creates review and returns 201", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ id: POST_ID, userId: MOCK_USER_ID });
    mockReviewCreate.mockResolvedValue(SAMPLE_REVIEW);
    const res = await createPOST(
      makeRequest(`http://localhost/api/posts/${POST_ID}/external-reviews`, "POST", {
        reviewerEmail: "reviewer@example.com",
        reviewerName: "Test Reviewer",
        message: "Please review",
      }),
      { params: Promise.resolve({ id: POST_ID }) }
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { review: typeof SAMPLE_REVIEW };
    expect(data.review.reviewerEmail).toBe("reviewer@example.com");
    expect(mockReviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          postId: POST_ID,
          userId: MOCK_USER_ID,
          reviewerEmail: "reviewer@example.com",
        }),
      })
    );
  });
});

// ── GET /api/posts/[id]/external-reviews ─────────────────────────────────────

describe("GET /api/posts/[id]/external-reviews", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listGET(
      makeRequest(`http://localhost/api/posts/${POST_ID}/external-reviews`),
      { params: Promise.resolve({ id: POST_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns reviews list for authenticated post owner", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockPostFindUnique.mockResolvedValue({ id: POST_ID, userId: MOCK_USER_ID });
    mockReviewFindMany.mockResolvedValue([SAMPLE_REVIEW]);
    const res = await listGET(
      makeRequest(`http://localhost/api/posts/${POST_ID}/external-reviews`),
      { params: Promise.resolve({ id: POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { reviews: typeof SAMPLE_REVIEW[] };
    expect(data.reviews).toHaveLength(1);
    expect(data.reviews[0].id).toBe(REVIEW_ID);
  });
});

// ── DELETE /api/posts/[id]/external-reviews/[reviewId] ───────────────────────

describe("DELETE /api/posts/[id]/external-reviews/[reviewId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await cancelDELETE(
      makeRequest(`http://localhost/api/posts/${POST_ID}/external-reviews/${REVIEW_ID}`, "DELETE"),
      { params: Promise.resolve({ id: POST_ID, reviewId: REVIEW_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when review not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockReviewFindUnique.mockResolvedValue(null);
    const res = await cancelDELETE(
      makeRequest(`http://localhost/api/posts/${POST_ID}/external-reviews/${REVIEW_ID}`, "DELETE"),
      { params: Promise.resolve({ id: POST_ID, reviewId: REVIEW_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when review is already cancelled/responded", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockReviewFindUnique.mockResolvedValue({
      ...SAMPLE_REVIEW,
      status: "APPROVED",
    });
    const res = await cancelDELETE(
      makeRequest(`http://localhost/api/posts/${POST_ID}/external-reviews/${REVIEW_ID}`, "DELETE"),
      { params: Promise.resolve({ id: POST_ID, reviewId: REVIEW_ID }) }
    );
    expect(res.status).toBe(409);
  });

  it("cancels PENDING review and returns 200", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockReviewFindUnique.mockResolvedValue(SAMPLE_REVIEW);
    mockReviewUpdate.mockResolvedValue({ ...SAMPLE_REVIEW, status: "CANCELLED" });
    const res = await cancelDELETE(
      makeRequest(`http://localhost/api/posts/${POST_ID}/external-reviews/${REVIEW_ID}`, "DELETE"),
      { params: Promise.resolve({ id: POST_ID, reviewId: REVIEW_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { review: { status: string } };
    expect(data.review.status).toBe("CANCELLED");
  });
});

// ── GET /api/external-review/[token] ─────────────────────────────────────────

describe("GET /api/external-review/[token]", () => {
  it("returns 404 when token not found", async () => {
    mockReviewFindUnique.mockResolvedValue(null);
    const res = await publicGET(
      makeRequest(`http://localhost/api/external-review/${REVIEW_TOKEN}`),
      { params: Promise.resolve({ token: REVIEW_TOKEN }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 410 when review is expired", async () => {
    mockReviewFindUnique.mockResolvedValue({
      ...SAMPLE_REVIEW,
      expiresAt: new Date("2020-01-01T00:00:00Z"),
      post: SAMPLE_POST,
    });
    const res = await publicGET(
      makeRequest(`http://localhost/api/external-review/${REVIEW_TOKEN}`),
      { params: Promise.resolve({ token: REVIEW_TOKEN }) }
    );
    expect(res.status).toBe(410);
  });

  it("returns 200 with review and sanitized post data", async () => {
    mockReviewFindUnique.mockResolvedValue({
      ...SAMPLE_REVIEW,
      post: SAMPLE_POST,
    });
    const res = await publicGET(
      makeRequest(`http://localhost/api/external-review/${REVIEW_TOKEN}`),
      { params: Promise.resolve({ token: REVIEW_TOKEN }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      review: typeof SAMPLE_REVIEW;
      post: typeof SAMPLE_POST;
    };
    expect(data.review.id).toBe(REVIEW_ID);
    expect(data.review.reviewerEmail).toBe("reviewer@example.com");
    expect(data.post.content).toBe("Test post content");
    expect(data.post).not.toHaveProperty("userId");
  });
});

// ── POST /api/external-review/[token]/respond ─────────────────────────────────

describe("POST /api/external-review/[token]/respond", () => {
  it("returns 200 on successful approval", async () => {
    mockReviewFindUnique.mockResolvedValue(SAMPLE_REVIEW);
    mockReviewUpdate.mockResolvedValue({ ...SAMPLE_REVIEW, status: "APPROVED" });
    const res = await respondPOST(
      makeRequest(
        `http://localhost/api/external-review/${REVIEW_TOKEN}/respond`,
        "POST",
        { decision: "APPROVED", feedback: "Looks great!" }
      ),
      { params: Promise.resolve({ token: REVIEW_TOKEN }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe("APPROVED");
    expect(mockReviewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          feedback: "Looks great!",
        }),
      })
    );
  });

  it("returns 409 when review already responded", async () => {
    mockReviewFindUnique.mockResolvedValue({
      ...SAMPLE_REVIEW,
      status: "APPROVED",
    });
    const res = await respondPOST(
      makeRequest(
        `http://localhost/api/external-review/${REVIEW_TOKEN}/respond`,
        "POST",
        { decision: "REJECTED" }
      ),
      { params: Promise.resolve({ token: REVIEW_TOKEN }) }
    );
    expect(res.status).toBe(409);
  });
});
