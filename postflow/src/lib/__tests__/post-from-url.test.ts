import { POST } from "@/app/api/ai/post-from-url/route";
import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));
jest.mock("@/lib/ai", () => ({ generatePostFromUrl: jest.fn() }));
jest.mock("@/lib/web-content", () => ({ extractWebContent: jest.fn() }));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err: unknown) => {
    const { NextResponse } = jest.requireActual("next/server");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }),
}));

import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generatePostFromUrl } from "@/lib/ai";
import { extractWebContent } from "@/lib/web-content";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockApiLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockGeneratePostFromUrl = generatePostFromUrl as jest.MockedFunction<typeof generatePostFromUrl>;
const mockExtractWebContent = extractWebContent as jest.MockedFunction<typeof extractWebContent>;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ai/post-from-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeMalformedRequest(): NextRequest {
  return new NextRequest("http://localhost/api/ai/post-from-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json",
  });
}

describe("POST /api/ai/post-from-url", () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as never);
    mockApiLimiter.mockResolvedValue({ success: true, limit: 100, remaining: 99, resetAt: new Date() });
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalEnv;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ url: "https://example.com", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false, limit: 100, remaining: 0, resetAt: new Date() });
    const res = await POST(makeRequest({ url: "https://example.com", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({ url: "https://example.com", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not configured/i);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await POST(makeMalformedRequest());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 400 when URL is missing", async () => {
    const res = await POST(makeRequest({ platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid input");
  });

  it("returns 400 when URL is invalid", async () => {
    const res = await POST(makeRequest({ url: "not-a-url", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid input");
  });

  it("returns 422 when URL content extraction fails", async () => {
    mockExtractWebContent.mockResolvedValue(null);
    const res = await POST(makeRequest({ url: "https://example.com", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/could not extract/i);
  });

  it("returns success with posts array", async () => {
    mockExtractWebContent.mockResolvedValue({ title: "Test Article", content: "Some content" });
    mockGeneratePostFromUrl.mockResolvedValue({
      posts: [
        { platform: "FACEBOOK", content: "Facebook post content" },
        { platform: "INSTAGRAM", content: "Instagram post content" },
      ],
    });
    const res = await POST(makeRequest({ url: "https://example.com", platforms: ["FACEBOOK", "INSTAGRAM"] }));
    expect(res.status).toBe(200);
    const body = await res.json() as { posts: { platform: string; content: string }[] };
    expect(Array.isArray(body.posts)).toBe(true);
    expect(body.posts.length).toBe(2);
  });

  it("returns posts with platform and content fields", async () => {
    mockExtractWebContent.mockResolvedValue({ title: "Article Title", content: "Article body text" });
    mockGeneratePostFromUrl.mockResolvedValue({
      posts: [{ platform: "THREADS", content: "Threads post text here" }],
    });
    const res = await POST(makeRequest({ url: "https://example.com/article", platforms: ["THREADS"] }));
    expect(res.status).toBe(200);
    const body = await res.json() as { posts: { platform: string; content: string }[] };
    expect(body.posts[0]).toHaveProperty("platform", "THREADS");
    expect(body.posts[0]).toHaveProperty("content", "Threads post text here");
  });

  it("returns 500 when AI generation fails", async () => {
    mockExtractWebContent.mockResolvedValue({ title: "Test", content: "Content" });
    mockGeneratePostFromUrl.mockResolvedValue(null);
    const res = await POST(makeRequest({ url: "https://example.com", platforms: ["FACEBOOK"] }));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/failed/i);
  });
});
