import { NextRequest } from "next/server";

jest.mock("@/lib/ai", () => ({
  checkContentAccessibility: jest.fn(),
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

import { POST } from "@/app/api/ai/accessibility-check/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { checkContentAccessibility } from "@/lib/ai";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockApiLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockCheck = checkContentAccessibility as jest.MockedFunction<
  typeof checkContentAccessibility
>;

const mockResult = {
  score: 85,
  passesStandards: true,
  issues: [
    {
      type: "hashtag_casing" as const,
      severity: "low" as const,
      text: "#blackhistorymonth",
      suggestion: "#BlackHistoryMonth",
      explanation: "CamelCase hashtags are more readable for screen readers.",
    },
  ],
  recommendations: ["Use CamelCase hashtags for better screen reader support."],
  summary: "Content is mostly accessible with one minor hashtag casing issue.",
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/accessibility-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/accessibility-check", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV, ANTHROPIC_API_KEY: "test-key" };
    mockAuth.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof auth>>);
    mockApiLimiter.mockResolvedValue(null);
    mockCheck.mockResolvedValue(mockResult);
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ content: "Hello world content here" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(
      new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
      })
    );
    const res = await POST(makeRequest({ content: "Hello world content here" }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI not configured", async () => {
    process.env = { ...OLD_ENV };
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({ content: "Hello world content here" }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/ai/accessibility-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content exceeds max length", async () => {
    const res = await POST(makeRequest({ content: "a".repeat(10001) }));
    expect(res.status).toBe(400);
  });

  it("returns success shape with score, passesStandards, issues, recommendations", async () => {
    const res = await POST(
      makeRequest({ content: "Check out our new product! #blackhistorymonth" })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof mockResult;
    expect(typeof data.score).toBe("number");
    expect(typeof data.passesStandards).toBe("boolean");
    expect(Array.isArray(data.issues)).toBe(true);
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(typeof data.summary).toBe("string");
  });

  it("forwards altTexts to the AI function", async () => {
    const altTexts = ["A photo of a sunset over the mountains"];
    await POST(
      makeRequest({
        content: "Check out this beautiful view!",
        altTexts,
      })
    );
    expect(mockCheck).toHaveBeenCalledWith(
      "Check out this beautiful view!",
      altTexts,
      undefined
    );
  });

  it("forwards platform to the AI function", async () => {
    await POST(
      makeRequest({
        content: "Platform-specific content here for testing.",
        platform: "INSTAGRAM",
      })
    );
    expect(mockCheck).toHaveBeenCalledWith(
      "Platform-specific content here for testing.",
      undefined,
      "INSTAGRAM"
    );
  });

  it("returns 500 when AI returns null", async () => {
    mockCheck.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ content: "Hello world content for accessibility test." })
    );
    expect(res.status).toBe(500);
  });

  it("returns 500 when AI throws an error", async () => {
    mockCheck.mockRejectedValue(new Error("AI service error"));
    const res = await POST(
      makeRequest({ content: "Hello world content for accessibility test." })
    );
    expect(res.status).toBe(500);
  });
});
