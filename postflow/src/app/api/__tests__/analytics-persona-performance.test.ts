jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
  PublishStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PUBLISHED: "PUBLISHED",
    FAILED: "FAILED",
  },
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
      findMany: jest.fn(),
    },
    audiencePersona: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((e: unknown) => {
    const { NextResponse } = jest.requireActual("next/server");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/persona-performance/route";
import type { PersonaPerformanceResponse } from "@/app/api/analytics/persona-performance/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPostFindMany = prisma.post.findMany as jest.Mock;
const mockPersonaFindMany = prisma.audiencePersona.findMany as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:3000/api/analytics/persona-performance${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

function makePost(
  personaId: string | null,
  platform: string,
  likes: number,
  comments: number,
  shares: number,
  impressions = 0,
  reach = 0
) {
  return {
    id: `post-${Math.random().toString(36).slice(2, 8)}`,
    content: "Test post content",
    targetPersonaId: personaId,
    publishResults: [
      {
        platform,
        insights: { likes, comments, shares, impressions, reach },
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
  mockPostFindMany.mockResolvedValue([]);
  mockPersonaFindMany.mockResolvedValue([]);
});

describe("GET /api/analytics/persona-performance", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RATE_LIMIT_EXCEEDED);
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid period", async () => {
    const res = await GET(makeRequest({ period: "999d" }));
    expect(res.status).toBe(400);
  });

  it("returns empty personas array when no posts exist", async () => {
    mockPostFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as PersonaPerformanceResponse;
    expect(Array.isArray(body.personas)).toBe(true);
    expect(body.personas).toHaveLength(0);
    expect(body.totalPosts).toBe(0);
  });

  it("returns correct totalPosts count", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost("persona1", "FACEBOOK", 10, 2, 1),
      makePost("persona1", "INSTAGRAM", 5, 1, 0),
      makePost(null, "TWITTER", 3, 0, 0),
    ]);
    mockPersonaFindMany.mockResolvedValue([{ id: "persona1", name: "Young Adults" }]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as PersonaPerformanceResponse;
    expect(body.totalPosts).toBe(3);
  });

  it("groups posts by persona correctly with correct postCount", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost("persona1", "FACEBOOK", 10, 2, 1),
      makePost("persona1", "INSTAGRAM", 5, 1, 0),
      makePost("persona2", "TWITTER", 3, 0, 0),
    ]);
    mockPersonaFindMany.mockResolvedValue([
      { id: "persona1", name: "Young Adults" },
      { id: "persona2", name: "Professionals" },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as PersonaPerformanceResponse;
    const youngAdults = body.personas.find((p) => p.personaId === "persona1");
    const professionals = body.personas.find((p) => p.personaId === "persona2");

    expect(youngAdults).toBeDefined();
    expect(youngAdults?.postCount).toBe(2);
    expect(youngAdults?.personaName).toBe("Young Adults");

    expect(professionals).toBeDefined();
    expect(professionals?.postCount).toBe(1);
    expect(professionals?.personaName).toBe("Professionals");
  });

  it("puts null targetPersonaId posts into Unassigned group", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost(null, "FACEBOOK", 5, 1, 0),
      makePost(null, "INSTAGRAM", 8, 2, 1),
    ]);
    mockPersonaFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as PersonaPerformanceResponse;
    expect(body.personas).toHaveLength(1);
    const unassigned = body.personas[0];
    expect(unassigned.personaId).toBeNull();
    expect(unassigned.personaName).toBe("Unassigned");
    expect(unassigned.postCount).toBe(2);
  });

  it("calculates avgEngagement correctly", async () => {
    // Post 1: likes=10, comments=5, shares=2 → engagement=17
    // Post 2: likes=3, comments=1, shares=1 → engagement=5
    // avg = (17+5)/2 = 11
    mockPostFindMany.mockResolvedValue([
      makePost("persona1", "FACEBOOK", 10, 5, 2),
      makePost("persona1", "INSTAGRAM", 3, 1, 1),
    ]);
    mockPersonaFindMany.mockResolvedValue([{ id: "persona1", name: "Young Adults" }]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as PersonaPerformanceResponse;
    const persona = body.personas.find((p) => p.personaId === "persona1");
    expect(persona).toBeDefined();
    expect(persona?.avgEngagement).toBe(11);
  });

  it("response has correct shape with period, personas array, and totalPosts", async () => {
    mockPostFindMany.mockResolvedValue([makePost("persona1", "FACEBOOK", 10, 2, 1)]);
    mockPersonaFindMany.mockResolvedValue([{ id: "persona1", name: "Young Adults" }]);

    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as PersonaPerformanceResponse;
    expect(body).toHaveProperty("period", "7d");
    expect(body).toHaveProperty("personas");
    expect(body).toHaveProperty("totalPosts");
    expect(Array.isArray(body.personas)).toBe(true);

    const persona = body.personas[0];
    expect(persona).toHaveProperty("personaId");
    expect(persona).toHaveProperty("personaName");
    expect(persona).toHaveProperty("postCount");
    expect(persona).toHaveProperty("avgEngagement");
    expect(persona).toHaveProperty("totalImpressions");
    expect(persona).toHaveProperty("totalReach");
    expect(persona).toHaveProperty("topPost");
    expect(persona).toHaveProperty("platforms");
  });

  it("sorts named personas before unassigned and by avgEngagement descending", async () => {
    // persona1: engagement=5, persona2: engagement=20, null: engagement=10
    mockPostFindMany.mockResolvedValue([
      makePost("persona1", "FACEBOOK", 3, 1, 1),   // engagement=5
      makePost("persona2", "INSTAGRAM", 15, 3, 2),  // engagement=20
      makePost(null, "TWITTER", 8, 1, 1),           // engagement=10
    ]);
    mockPersonaFindMany.mockResolvedValue([
      { id: "persona1", name: "Casual Users" },
      { id: "persona2", name: "Power Users" },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as PersonaPerformanceResponse;
    expect(body.personas).toHaveLength(3);

    // First should be persona2 (highest engagement among named)
    expect(body.personas[0].personaId).toBe("persona2");
    // Second should be persona1
    expect(body.personas[1].personaId).toBe("persona1");
    // Last should be unassigned (null)
    expect(body.personas[2].personaId).toBeNull();
    expect(body.personas[2].personaName).toBe("Unassigned");
  });

  it("includes platform distribution in each persona group", async () => {
    mockPostFindMany.mockResolvedValue([
      makePost("persona1", "FACEBOOK", 10, 2, 1),
      makePost("persona1", "INSTAGRAM", 5, 1, 0),
      makePost("persona1", "FACEBOOK", 8, 0, 0),
    ]);
    mockPersonaFindMany.mockResolvedValue([{ id: "persona1", name: "Young Adults" }]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as PersonaPerformanceResponse;
    const persona = body.personas.find((p) => p.personaId === "persona1");
    expect(persona).toBeDefined();

    const fbPlatform = persona?.platforms.find((p) => p.platform === "FACEBOOK");
    const igPlatform = persona?.platforms.find((p) => p.platform === "INSTAGRAM");

    expect(fbPlatform?.count).toBe(2);
    expect(igPlatform?.count).toBe(1);
  });
});
