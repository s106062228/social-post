import { NextRequest } from "next/server";

jest.mock("@/lib/ai", () => ({
  summarizeContent: jest.fn(),
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

import { POST } from "@/app/api/ai/summarize/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { summarizeContent } from "@/lib/ai";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockApiLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockSummarize = summarizeContent as jest.MockedFunction<typeof summarizeContent>;

const mockResult = {
  summary: "This is a concise summary of the content.",
  keyPoints: ["Key point 1", "Key point 2", "Key point 3"],
  title: "A Punchy Headline",
  charCount: 42,
};

const VALID_CONTENT = "a".repeat(50);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/summarize", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV, ANTHROPIC_API_KEY: "test-key" };
    mockAuth.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof auth>>);
    mockApiLimiter.mockResolvedValue(null);
    mockSummarize.mockResolvedValue(mockResult);
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ content: VALID_CONTENT }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(
      new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
      })
    );
    const res = await POST(makeRequest({ content: VALID_CONTENT }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI not configured", async () => {
    process.env = { ...OLD_ENV };
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({ content: VALID_CONTENT }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/ai/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is too short", async () => {
    const res = await POST(makeRequest({ content: "a".repeat(49) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is too long", async () => {
    const res = await POST(makeRequest({ content: "a".repeat(50001) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetLength is out of range", async () => {
    const res = await POST(makeRequest({ content: VALID_CONTENT, targetLength: 10 }));
    expect(res.status).toBe(400);
  });

  it("returns success shape with summary, keyPoints, title, charCount", async () => {
    const res = await POST(makeRequest({ content: VALID_CONTENT }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as typeof mockResult;
    expect(typeof data.summary).toBe("string");
    expect(Array.isArray(data.keyPoints)).toBe(true);
    expect(typeof data.title).toBe("string");
    expect(typeof data.charCount).toBe("number");
  });

  it("forwards style param to AI function", async () => {
    await POST(makeRequest({ content: VALID_CONTENT, style: "bullet_points" }));
    expect(mockSummarize).toHaveBeenCalledWith(
      VALID_CONTENT,
      280,
      "bullet_points",
      undefined
    );
  });

  it("forwards platforms param to AI function", async () => {
    const platforms = ["INSTAGRAM", "TWITTER"];
    await POST(makeRequest({ content: VALID_CONTENT, platforms }));
    expect(mockSummarize).toHaveBeenCalledWith(
      VALID_CONTENT,
      280,
      undefined,
      platforms
    );
  });

  it("returns 500 when AI returns null", async () => {
    mockSummarize.mockResolvedValue(null);
    const res = await POST(makeRequest({ content: VALID_CONTENT }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when AI throws an error", async () => {
    mockSummarize.mockRejectedValue(new Error("AI service error"));
    const res = await POST(makeRequest({ content: VALID_CONTENT }));
    expect(res.status).toBe(500);
  });
});
