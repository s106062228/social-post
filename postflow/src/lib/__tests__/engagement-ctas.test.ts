import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock("@/lib/ai", () => ({
  generateEngagementCTAs: jest.fn(),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err: unknown) =>
    Response.json({ error: String(err) }, { status: 500 })
  ),
}));

import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateEngagementCTAs } from "@/lib/ai";
import { POST } from "@/app/api/ai/engagement-ctas/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockRl = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockGenerate = generateEngagementCTAs as jest.MockedFunction<typeof generateEngagementCTAs>;

const rlAllow = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const rlDeny  = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

const mockResult = {
  ctas: [
    {
      text: "What do you think? Drop your thoughts below! 👇",
      type: "comment",
      engagementBoost: "high" as const,
      explanation: "Questions drive comments which boost algorithmic reach.",
    },
    {
      text: "Tag a friend who needs to see this!",
      type: "share",
      engagementBoost: "high" as const,
      explanation: "Tagging expands reach organically.",
    },
    {
      text: "Save this for later — you'll thank yourself!",
      type: "save",
      engagementBoost: "medium" as const,
      explanation: "Saves signal high-value content to the algorithm.",
    },
    {
      text: "Agree or disagree? Let us know 👇",
      type: "question",
      engagementBoost: "medium" as const,
      explanation: "Polarizing questions encourage responses.",
    },
    {
      text: "Follow for more tips like this every day!",
      type: "follow",
      platform: "INSTAGRAM",
      engagementBoost: "low" as const,
      explanation: "Direct follow asks work best at end of value-packed posts.",
    },
  ],
  hook: "Most people get this completely wrong — here's what actually works:",
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/engagement-ctas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/engagement-ctas", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow as never);
    mockGenerate.mockResolvedValue(mockResult as never);
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(makeRequest({
      content: "Just launched our new product and we are so excited to share it with you all!",
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockRl.mockResolvedValue(rlDeny as never);
    const res = await POST(makeRequest({
      content: "Just launched our new product and we are so excited to share it with you all!",
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({
      content: "Just launched our new product and we are so excited to share it with you all!",
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(503);
  });

  it("returns 400 when JSON body is invalid", async () => {
    const req = new NextRequest("http://localhost/api/ai/engagement-ctas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is too short", async () => {
    const res = await POST(makeRequest({
      content: "Short",
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    const res = await POST(makeRequest({
      content: "Just launched our new product and we are so excited to share it with you all!",
      platforms: [],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with ctas array and hook string on success", async () => {
    const res = await POST(makeRequest({
      content: "Just launched our new product and we are so excited to share it with you all!",
      platforms: ["INSTAGRAM", "FACEBOOK"],
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof mockResult;
    expect(Array.isArray(data.ctas)).toBe(true);
    expect(typeof data.hook).toBe("string");
  });

  it("forwards ctaType param to generateEngagementCTAs", async () => {
    await POST(makeRequest({
      content: "Just launched our new product and we are so excited to share it with you all!",
      platforms: ["INSTAGRAM"],
      ctaType: "question",
    }));
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      "question"
    );
  });

  it("each CTA has text, type, engagementBoost, and explanation", async () => {
    const res = await POST(makeRequest({
      content: "Just launched our new product and we are so excited to share it with you all!",
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof mockResult;
    expect(data.ctas.length).toBeGreaterThan(0);
    const cta = data.ctas[0];
    expect(typeof cta.text).toBe("string");
    expect(typeof cta.type).toBe("string");
    expect(typeof cta.engagementBoost).toBe("string");
    expect(typeof cta.explanation).toBe("string");
  });

  it("engagementBoost is one of low, medium, or high", async () => {
    const res = await POST(makeRequest({
      content: "Just launched our new product and we are so excited to share it with you all!",
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof mockResult;
    for (const cta of data.ctas) {
      expect(["low", "medium", "high"]).toContain(cta.engagementBoost);
    }
  });

  it("returns 500 when AI returns null", async () => {
    mockGenerate.mockResolvedValue(null as never);
    const res = await POST(makeRequest({
      content: "Just launched our new product and we are so excited to share it with you all!",
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(500);
  });

  it("returns 500 on unexpected AI error", async () => {
    mockGenerate.mockRejectedValue(new Error("API failure"));
    const res = await POST(makeRequest({
      content: "Just launched our new product and we are so excited to share it with you all!",
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(500);
  });
});
