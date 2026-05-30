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
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHED: "PUBLISHED",
    FAILED: "FAILED",
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
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/teams/[id]/calendar/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockTeamMemberFindUnique = prisma.teamMember.findUnique as jest.Mock;
const mockTeamMemberFindMany = prisma.teamMember.findMany as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;

function makeRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const MEMBER_1 = {
  id: "mem1",
  teamId: "team1",
  userId: "user1",
  role: "OWNER",
  createdAt: new Date(),
  user: { id: "user1", name: "Alice", email: "alice@example.com" },
};
const MEMBER_2 = {
  id: "mem2",
  teamId: "team1",
  userId: "user2",
  role: "EDITOR",
  createdAt: new Date(),
  user: { id: "user2", name: "Bob", email: "bob@example.com" },
};

const SAMPLE_POST = {
  id: "post1",
  content: "Hello world",
  scheduledAt: new Date("2025-06-15T10:00:00Z"),
  status: "SCHEDULED",
  userId: "user1",
  publishResults: [{ platform: "FACEBOOK" }],
};

describe("GET /api/teams/[id]/calendar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLimiter.mockResolvedValue({ success: true, limit: 100, remaining: 99, resetAt: new Date() });
    mockTeamMemberFindUnique.mockResolvedValue(MEMBER_1);
    mockTeamMemberFindMany.mockResolvedValue([MEMBER_1, MEMBER_2]);
    mockPostFindMany.mockResolvedValue([SAMPLE_POST]);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest("http://localhost/api/teams/team1/calendar"), makeParams("team1"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockApiLimiter.mockResolvedValue({ success: false, limit: 100, remaining: 0, resetAt: new Date() });
    const res = await GET(makeRequest("http://localhost/api/teams/team1/calendar"), makeParams("team1"));
    expect(res.status).toBe(429);
  });

  it("returns 403 when user is not a team member", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockTeamMemberFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest("http://localhost/api/teams/team1/calendar"), makeParams("team1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Not a team member");
  });

  it("returns 400 for invalid month param", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    const res = await GET(
      makeRequest("http://localhost/api/teams/team1/calendar?year=2025&month=13"),
      makeParams("team1")
    );
    expect(res.status).toBe(400);
  });

  it("defaults to current month when no params given", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    const res = await GET(makeRequest("http://localhost/api/teams/team1/calendar"), makeParams("team1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const now = new Date();
    expect(body.year).toBe(now.getFullYear());
    expect(body.month).toBe(now.getMonth() + 1);
  });

  it("returns posts from all team members", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    const res = await GET(
      makeRequest("http://localhost/api/teams/team1/calendar?year=2025&month=6"),
      makeParams("team1")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].postId).toBe("post1");
    expect(body.posts[0].authorName).toBe("Alice");
    expect(body.posts[0].platforms).toEqual(["FACEBOOK"]);
  });

  it("returns correct year and month in response", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    const res = await GET(
      makeRequest("http://localhost/api/teams/team1/calendar?year=2025&month=3"),
      makeParams("team1")
    );
    const body = await res.json();
    expect(body.year).toBe(2025);
    expect(body.month).toBe(3);
  });

  it("returns empty posts array when no posts in month", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockPostFindMany.mockResolvedValue([]);
    const res = await GET(
      makeRequest("http://localhost/api/teams/team1/calendar?year=2025&month=1"),
      makeParams("team1")
    );
    const body = await res.json();
    expect(body.posts).toEqual([]);
  });

  it("includes authorId, authorName, scheduledAt, status in post shape", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    const res = await GET(
      makeRequest("http://localhost/api/teams/team1/calendar?year=2025&month=6"),
      makeParams("team1")
    );
    const body = await res.json();
    const post = body.posts[0];
    expect(post).toHaveProperty("postId");
    expect(post).toHaveProperty("content");
    expect(post).toHaveProperty("scheduledAt");
    expect(post).toHaveProperty("status");
    expect(post).toHaveProperty("authorId", "user1");
    expect(post).toHaveProperty("authorName", "Alice");
    expect(post).toHaveProperty("platforms");
  });
});
