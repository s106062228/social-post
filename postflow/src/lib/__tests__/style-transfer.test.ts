import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock("@/lib/ai", () => ({
  styleTransferContent: jest.fn(),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err: unknown) =>
    Response.json({ error: String(err) }, { status: 500 })
  ),
}));

import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { styleTransferContent } from "@/lib/ai";
import { POST } from "@/app/api/ai/style-transfer/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockRl = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockTransfer = styleTransferContent as jest.MockedFunction<typeof styleTransferContent>;

const rlAllow = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const rlDeny  = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

const mockResult = {
  styledContent: "Hey everyone! Just tried this awesome recipe and WOW it totally blew my mind 🔥 #food #recipe",
  changes: ["Replaced formal language with contractions", "Added emoji for personality"],
  styleName: "Casual & Conversational",
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/style-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/style-transfer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow as never);
    mockTransfer.mockResolvedValue(mockResult as never);
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(makeRequest({
      content: "We are pleased to inform you that our new product has been launched.",
      targetStyle: "casual",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockRl.mockResolvedValue(rlDeny as never);
    const res = await POST(makeRequest({
      content: "We are pleased to inform you that our new product has been launched.",
      targetStyle: "casual",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({
      content: "We are pleased to inform you that our new product has been launched.",
      targetStyle: "casual",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(503);
  });

  it("returns 400 when JSON body is invalid", async () => {
    const req = new NextRequest("http://localhost/api/ai/style-transfer", {
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
      targetStyle: "casual",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    const res = await POST(makeRequest({
      content: "We are pleased to inform you that our new product has been launched.",
      targetStyle: "casual",
      platforms: [],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetStyle is invalid", async () => {
    const res = await POST(makeRequest({
      content: "We are pleased to inform you that our new product has been launched.",
      targetStyle: "angry",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with styledContent, changes, and styleName on success", async () => {
    const res = await POST(makeRequest({
      content: "We are pleased to inform you that our new product has been launched.",
      targetStyle: "casual",
      platforms: ["FACEBOOK", "INSTAGRAM"],
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof mockResult;
    expect(data.styledContent).toBe(mockResult.styledContent);
    expect(Array.isArray(data.changes)).toBe(true);
    expect(typeof data.styleName).toBe("string");
  });

  it("accepts all 7 valid styles", async () => {
    const styles = ["casual", "professional", "concise", "engaging", "humorous", "inspirational", "educational"];
    for (const style of styles) {
      mockTransfer.mockResolvedValue(mockResult as never);
      const res = await POST(makeRequest({
        content: "We are pleased to inform you that our new product has been launched.",
        targetStyle: style,
        platforms: ["FACEBOOK"],
      }));
      expect(res.status).toBe(200);
    }
  });

  it("returns 500 when AI returns null", async () => {
    mockTransfer.mockResolvedValue(null as never);
    const res = await POST(makeRequest({
      content: "We are pleased to inform you that our new product has been launched.",
      targetStyle: "casual",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(500);
  });

  it("returns 500 on unexpected AI error", async () => {
    mockTransfer.mockRejectedValue(new Error("API failure"));
    const res = await POST(makeRequest({
      content: "We are pleased to inform you that our new product has been launched.",
      targetStyle: "casual",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(500);
  });
});
