import { NextRequest } from "next/server";

jest.mock("@/lib/ai", () => ({
  generateAdCopy: jest.fn(),
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn().mockImplementation((err: unknown) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }),
}));

import { POST } from "@/app/api/ai/ad-copy/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateAdCopy } from "@/lib/ai";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockApiLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockGenerateAdCopy = generateAdCopy as jest.MockedFunction<typeof generateAdCopy>;

const mockResult = {
  variants: [
    {
      platform: "FACEBOOK",
      headline: "Boost Your Business",
      primaryText: "Reach more customers with our powerful tools.",
      callToAction: "Learn More",
      targetingNotes: "Target business owners 25-55",
      charCounts: { headline: 20, primaryText: 45 },
    },
  ],
  guidelines: ["Use high-contrast images", "Include a clear CTA"],
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/ad-copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/ad-copy", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV, ANTHROPIC_API_KEY: "test-key" };
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as Awaited<ReturnType<typeof auth>>);
    mockApiLimiter.mockResolvedValue({ success: true } as Awaited<ReturnType<typeof apiLimiter>>);
    mockGenerateAdCopy.mockResolvedValue(mockResult);
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ content: "Hello world test", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false } as Awaited<ReturnType<typeof apiLimiter>>);
    const res = await POST(makeRequest({ content: "Hello world test", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({ content: "Hello world test", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("not configured");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/ai/ad-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is too short", async () => {
    const res = await POST(makeRequest({ content: "short", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms is empty", async () => {
    const res = await POST(makeRequest({ content: "Hello world this is a longer test", platforms: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with ad copy result on success", async () => {
    const res = await POST(makeRequest({
      content: "Check out our amazing new product for entrepreneurs!",
      platforms: ["FACEBOOK", "INSTAGRAM"],
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof mockResult;
    expect(data.variants).toHaveLength(1);
    expect(data.variants[0].platform).toBe("FACEBOOK");
    expect(data.guidelines).toHaveLength(2);
  });

  it("passes objective and targetAudience to generateAdCopy", async () => {
    await POST(makeRequest({
      content: "Discover our premium membership for fitness enthusiasts",
      platforms: ["INSTAGRAM"],
      objective: "leads",
      targetAudience: "fitness enthusiasts aged 25-45",
    }));
    expect(mockGenerateAdCopy).toHaveBeenCalledWith(
      "Discover our premium membership for fitness enthusiasts",
      ["INSTAGRAM"],
      "leads",
      "fitness enthusiasts aged 25-45",
      null
    );
  });

  it("passes budget to generateAdCopy", async () => {
    await POST(makeRequest({
      content: "Discover our premium membership for fitness enthusiasts",
      platforms: ["FACEBOOK"],
      budget: "medium",
    }));
    expect(mockGenerateAdCopy).toHaveBeenCalledWith(
      expect.any(String),
      ["FACEBOOK"],
      "general",
      null,
      "medium"
    );
  });

  it("uses default objective of general when not provided", async () => {
    await POST(makeRequest({
      content: "Discover our premium membership for fitness enthusiasts",
      platforms: ["FACEBOOK"],
    }));
    expect(mockGenerateAdCopy).toHaveBeenCalledWith(
      expect.any(String),
      ["FACEBOOK"],
      "general",
      null,
      null
    );
  });

  it("returns 500 when generateAdCopy returns null", async () => {
    mockGenerateAdCopy.mockResolvedValue(null);
    const res = await POST(makeRequest({
      content: "Discover our premium membership for fitness enthusiasts",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(500);
  });

  it("handles unexpected errors", async () => {
    mockGenerateAdCopy.mockRejectedValue(new Error("AI service down"));
    const res = await POST(makeRequest({
      content: "Discover our premium membership for fitness enthusiasts",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(500);
  });
});
