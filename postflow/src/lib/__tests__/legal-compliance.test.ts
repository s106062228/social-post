import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock("@/lib/ai", () => ({
  checkLegalCompliance: jest.fn(),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err: unknown) =>
    Response.json({ error: String(err) }, { status: 500 })
  ),
}));

import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { checkLegalCompliance } from "@/lib/ai";
import { POST } from "@/app/api/ai/legal-compliance/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockRl = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockCheck = checkLegalCompliance as jest.MockedFunction<typeof checkLegalCompliance>;

const rlAllow = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const rlDeny  = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

const compliantResult = {
  compliant: true,
  issues: [],
  overallRisk: "low" as const,
  summary: "This post appears compliant with applicable regulations.",
};

const flaggedResult = {
  compliant: false,
  issues: [
    {
      type: "ftc_disclosure",
      severity: "high" as const,
      regulation: "FTC Guidelines 16 CFR Part 255",
      description: "Post promotes a product but does not include a disclosure that it is a paid partnership or sponsored content.",
      suggestion: "Add #ad, #sponsored, or #partner to clearly disclose the material connection.",
    },
    {
      type: "health_claim",
      severity: "medium" as const,
      regulation: "FDA Regulations 21 CFR",
      description: "The post makes health claims that may require FDA substantiation.",
      suggestion: "Add a disclaimer that these statements have not been evaluated by the FDA.",
    },
  ],
  overallRisk: "high" as const,
  summary: "This post has significant compliance issues that must be addressed before publishing.",
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/legal-compliance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/legal-compliance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow as never);
    mockCheck.mockResolvedValue(compliantResult as never);
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(makeRequest({
      content: "Check out our amazing weight-loss supplement that cures everything!",
      platforms: ["INSTAGRAM"],
      industry: "healthcare",
    }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockRl.mockResolvedValue(rlDeny as never);
    const res = await POST(makeRequest({
      content: "Check out our amazing weight-loss supplement that cures everything!",
      platforms: ["INSTAGRAM"],
      industry: "healthcare",
    }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({
      content: "Check out our amazing weight-loss supplement that cures everything!",
      platforms: ["INSTAGRAM"],
      industry: "healthcare",
    }));
    expect(res.status).toBe(503);
  });

  it("returns 400 when JSON body is invalid", async () => {
    const req = new NextRequest("http://localhost/api/ai/legal-compliance", {
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
      content: "Check out our amazing weight-loss supplement that cures everything!",
      platforms: [],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when industry is invalid", async () => {
    const res = await POST(makeRequest({
      content: "Check out our amazing weight-loss supplement that cures everything!",
      platforms: ["INSTAGRAM"],
      industry: "illegal_industry",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with compliant result when no issues found", async () => {
    mockCheck.mockResolvedValue(compliantResult as never);
    const res = await POST(makeRequest({
      content: "Here are 5 tips for a healthier lifestyle! Exercise regularly and eat balanced meals.",
      platforms: ["INSTAGRAM", "FACEBOOK"],
      industry: "general",
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof compliantResult;
    expect(data.compliant).toBe(true);
    expect(Array.isArray(data.issues)).toBe(true);
    expect(data.issues).toHaveLength(0);
    expect(data.overallRisk).toBe("low");
    expect(typeof data.summary).toBe("string");
  });

  it("returns 200 with flagged issues for non-compliant content", async () => {
    mockCheck.mockResolvedValue(flaggedResult as never);
    const res = await POST(makeRequest({
      content: "Our miracle supplement cures diabetes! Buy now — we partnered with @brand.",
      platforms: ["INSTAGRAM"],
      industry: "healthcare",
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof flaggedResult;
    expect(data.compliant).toBe(false);
    expect(data.issues).toHaveLength(2);
    expect(data.overallRisk).toBe("high");
  });

  it("returns issues with correct shape", async () => {
    mockCheck.mockResolvedValue(flaggedResult as never);
    const res = await POST(makeRequest({
      content: "Our miracle supplement cures diabetes! Buy now — we partnered with @brand.",
      platforms: ["INSTAGRAM"],
      industry: "healthcare",
    }));
    const data = await res.json() as typeof flaggedResult;
    const issue = data.issues[0];
    expect(typeof issue.type).toBe("string");
    expect(["low", "medium", "high"]).toContain(issue.severity);
    expect(typeof issue.regulation).toBe("string");
    expect(typeof issue.description).toBe("string");
    expect(typeof issue.suggestion).toBe("string");
  });

  it("forwards industry and country to AI function", async () => {
    await POST(makeRequest({
      content: "Invest now and get guaranteed 50% returns in just 30 days!",
      platforms: ["TWITTER"],
      industry: "finance",
      country: "UK",
    }));
    expect(mockCheck).toHaveBeenCalledWith(
      expect.any(String),
      "finance",
      ["TWITTER"],
      "UK"
    );
  });

  it("uses general industry when not specified", async () => {
    await POST(makeRequest({
      content: "Check out our amazing product, great for everyone!",
      platforms: ["FACEBOOK"],
    }));
    expect(mockCheck).toHaveBeenCalledWith(
      expect.any(String),
      "general",
      ["FACEBOOK"],
      undefined
    );
  });

  it("returns 500 when AI returns null", async () => {
    mockCheck.mockResolvedValue(null as never);
    const res = await POST(makeRequest({
      content: "Check out our amazing weight-loss supplement that cures everything!",
      platforms: ["INSTAGRAM"],
      industry: "healthcare",
    }));
    expect(res.status).toBe(500);
  });

  it("returns 500 on unexpected AI error", async () => {
    mockCheck.mockRejectedValue(new Error("API failure"));
    const res = await POST(makeRequest({
      content: "Check out our amazing weight-loss supplement that cures everything!",
      platforms: ["INSTAGRAM"],
      industry: "healthcare",
    }));
    expect(res.status).toBe(500);
  });
});
