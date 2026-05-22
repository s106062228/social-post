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
    },
    postPoll: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/posts/[id]/poll/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockPollFindUnique = prisma.postPoll.findUnique as jest.Mock;
const mockPollUpsert = prisma.postPoll.upsert as jest.Mock;
const mockPollDelete = prisma.postPoll.delete as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const MOCK_POST_ID = "clh3ck8zp0001qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };

const MOCK_POLL = {
  id: "clh3ck8zp0003qr5hyvxckahk",
  postId: MOCK_POST_ID,
  question: "What is your favourite colour?",
  options: ["Red", "Blue", "Green"],
  durationHours: 24,
  createdAt: new Date(),
};

const MOCK_POST = { id: MOCK_POST_ID, userId: MOCK_USER_ID };

function makeGetRequest(postId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/poll`, {
    method: "GET",
  });
}

function makePutRequest(postId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/poll`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest(postId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/poll`, {
    method: "DELETE",
  });
}

const ROUTE_PARAMS = { params: Promise.resolve({ id: MOCK_POST_ID }) };

describe("Poll API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true });
  });

  // ── GET /api/posts/[id]/poll ────────────────────────────────────────────────

  describe("GET /api/posts/[id]/poll", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValueOnce(null);
      const res = await GET(makeGetRequest(MOCK_POST_ID), ROUTE_PARAMS);
      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 429 when rate limit exceeded", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockApiLimiter.mockResolvedValueOnce({ success: false });
      const res = await GET(makeGetRequest(MOCK_POST_ID), ROUTE_PARAMS);
      expect(res.status).toBe(429);
    });

    it("returns 404 when post not found", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce(null);
      const res = await GET(makeGetRequest(MOCK_POST_ID), ROUTE_PARAMS);
      expect(res.status).toBe(404);
    });

    it("returns 404 when post belongs to another user", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: OTHER_USER_ID });
      const res = await GET(makeGetRequest(MOCK_POST_ID), ROUTE_PARAMS);
      expect(res.status).toBe(404);
    });

    it("returns 404 when post has no poll", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce(MOCK_POST);
      mockPollFindUnique.mockResolvedValueOnce(null);
      const res = await GET(makeGetRequest(MOCK_POST_ID), ROUTE_PARAMS);
      expect(res.status).toBe(404);
    });

    it("returns 200 with poll data when poll exists", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce(MOCK_POST);
      mockPollFindUnique.mockResolvedValueOnce(MOCK_POLL);
      const res = await GET(makeGetRequest(MOCK_POST_ID), ROUTE_PARAMS);
      expect(res.status).toBe(200);
      const data = (await res.json()) as typeof MOCK_POLL;
      expect(data.question).toBe(MOCK_POLL.question);
      expect(data.options).toEqual(MOCK_POLL.options);
      expect(data.durationHours).toBe(24);
    });
  });

  // ── PUT /api/posts/[id]/poll ────────────────────────────────────────────────

  describe("PUT /api/posts/[id]/poll", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValueOnce(null);
      const res = await PUT(makePutRequest(MOCK_POST_ID, {}), ROUTE_PARAMS);
      expect(res.status).toBe(401);
    });

    it("returns 429 when rate limit exceeded", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockApiLimiter.mockResolvedValueOnce({ success: false });
      const res = await PUT(makePutRequest(MOCK_POST_ID, {}), ROUTE_PARAMS);
      expect(res.status).toBe(429);
    });

    it("returns 404 when post not found", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce(null);
      const res = await PUT(makePutRequest(MOCK_POST_ID, {
        question: "Q?", options: ["A", "B"], durationHours: 24,
      }), ROUTE_PARAMS);
      expect(res.status).toBe(404);
    });

    it("returns 404 when post belongs to another user", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: OTHER_USER_ID });
      const res = await PUT(makePutRequest(MOCK_POST_ID, {
        question: "Q?", options: ["A", "B"], durationHours: 24,
      }), ROUTE_PARAMS);
      expect(res.status).toBe(404);
    });

    it("returns 400 when fewer than 2 options are provided", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce(MOCK_POST);
      const res = await PUT(makePutRequest(MOCK_POST_ID, {
        question: "Q?", options: ["Only one"], durationHours: 24,
      }), ROUTE_PARAMS);
      expect(res.status).toBe(400);
    });

    it("returns 400 when more than 4 options are provided", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce(MOCK_POST);
      const res = await PUT(makePutRequest(MOCK_POST_ID, {
        question: "Q?", options: ["A", "B", "C", "D", "E"], durationHours: 24,
      }), ROUTE_PARAMS);
      expect(res.status).toBe(400);
    });

    it("returns 400 when durationHours is not a valid value", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce(MOCK_POST);
      const res = await PUT(makePutRequest(MOCK_POST_ID, {
        question: "Q?", options: ["A", "B"], durationHours: 48,
      }), ROUTE_PARAMS);
      expect(res.status).toBe(400);
    });

    it("creates (upserts) poll and returns 200", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce(MOCK_POST);
      mockPollUpsert.mockResolvedValueOnce(MOCK_POLL);
      const res = await PUT(makePutRequest(MOCK_POST_ID, {
        question: "What is your favourite colour?",
        options: ["Red", "Blue", "Green"],
        durationHours: 24,
      }), ROUTE_PARAMS);
      expect(res.status).toBe(200);
      const data = (await res.json()) as typeof MOCK_POLL;
      expect(data.question).toBe("What is your favourite colour?");
      expect(mockPollUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { postId: MOCK_POST_ID },
          create: expect.objectContaining({ postId: MOCK_POST_ID, question: "What is your favourite colour?" }),
          update: expect.objectContaining({ question: "What is your favourite colour?" }),
        })
      );
    });
  });

  // ── DELETE /api/posts/[id]/poll ─────────────────────────────────────────────

  describe("DELETE /api/posts/[id]/poll", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValueOnce(null);
      const res = await DELETE(makeDeleteRequest(MOCK_POST_ID), ROUTE_PARAMS);
      expect(res.status).toBe(401);
    });

    it("returns 404 when post not found", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce(null);
      const res = await DELETE(makeDeleteRequest(MOCK_POST_ID), ROUTE_PARAMS);
      expect(res.status).toBe(404);
    });

    it("returns 404 when post belongs to another user", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce({ id: MOCK_POST_ID, userId: OTHER_USER_ID });
      const res = await DELETE(makeDeleteRequest(MOCK_POST_ID), ROUTE_PARAMS);
      expect(res.status).toBe(404);
    });

    it("returns 404 when no poll exists for the post", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce(MOCK_POST);
      mockPollFindUnique.mockResolvedValueOnce(null);
      const res = await DELETE(makeDeleteRequest(MOCK_POST_ID), ROUTE_PARAMS);
      expect(res.status).toBe(404);
    });

    it("deletes the poll and returns 200 with success", async () => {
      mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
      mockPostFindUnique.mockResolvedValueOnce(MOCK_POST);
      mockPollFindUnique.mockResolvedValueOnce(MOCK_POLL);
      mockPollDelete.mockResolvedValueOnce(MOCK_POLL);
      const res = await DELETE(makeDeleteRequest(MOCK_POST_ID), ROUTE_PARAMS);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);
      expect(mockPollDelete).toHaveBeenCalledWith({ where: { postId: MOCK_POST_ID } });
    });
  });
});
