import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock("@/lib/ai", () => ({
  generateProductCaptions: jest.fn(),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err: unknown) =>
    Response.json({ error: String(err) }, { status: 500 })
  ),
}));

import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateProductCaptions } from "@/lib/ai";
import { POST } from "@/app/api/ai/product-captions/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockRl = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockGenerate = generateProductCaptions as jest.MockedFunction<typeof generateProductCaptions>;

const rlAllow = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const rlDeny  = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

const mockResult = {
  captions: [
    { platform: "FACEBOOK", caption: "Try our Premium Coffee Blend today!", tone: "friendly", charCount: 39 },
    { platform: "INSTAGRAM", caption: "☕ Discover the richest coffee experience. #coffee #premium", tone: "casual", charCount: 59 },
  ],
  keyMessages: ["Rich, bold flavor", "Ethically sourced", "Free shipping over $50"],
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/product-captions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/product-captions", () => {
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
      productName: "Coffee",
      productDescription: "A delicious coffee blend made from the finest beans.",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockRl.mockResolvedValue(rlDeny as never);
    const res = await POST(makeRequest({
      productName: "Coffee",
      productDescription: "A delicious coffee blend made from the finest beans.",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({
      productName: "Coffee",
      productDescription: "A delicious coffee blend made from the finest beans.",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/ai/product-captions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when productName is missing", async () => {
    const res = await POST(makeRequest({
      productDescription: "A delicious coffee blend made from the finest beans.",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when productDescription is too short", async () => {
    const res = await POST(makeRequest({
      productName: "Coffee",
      productDescription: "Short",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms is empty", async () => {
    const res = await POST(makeRequest({
      productName: "Coffee",
      productDescription: "A delicious coffee blend made from the finest beans.",
      platforms: [],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with captions and keyMessages on success", async () => {
    const res = await POST(makeRequest({
      productName: "Premium Coffee Blend",
      productDescription: "A delicious coffee blend made from the finest ethically-sourced beans.",
      platforms: ["FACEBOOK", "INSTAGRAM"],
      promotionType: "launch",
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof mockResult;
    expect(data.captions).toHaveLength(2);
    expect(data.keyMessages).toHaveLength(3);
    expect(data.captions[0].platform).toBe("FACEBOOK");
    expect(data.captions[0].caption).toBeDefined();
    expect(data.captions[0].tone).toBeDefined();
    expect(data.captions[0].charCount).toBeDefined();
  });

  it("passes promotionType and targetAudience to AI function", async () => {
    await POST(makeRequest({
      productName: "Premium Coffee Blend",
      productDescription: "A delicious coffee blend made from the finest ethically-sourced beans.",
      platforms: ["FACEBOOK"],
      promotionType: "sale",
      targetAudience: "coffee enthusiasts aged 25-45",
    }));
    expect(mockGenerate).toHaveBeenCalledWith(
      "Premium Coffee Blend",
      "A delicious coffee blend made from the finest ethically-sourced beans.",
      ["FACEBOOK"],
      "sale",
      "coffee enthusiasts aged 25-45"
    );
  });

  it("uses 'general' as default promotionType and omits targetAudience", async () => {
    await POST(makeRequest({
      productName: "Premium Coffee Blend",
      productDescription: "A delicious coffee blend made from the finest ethically-sourced beans.",
      platforms: ["FACEBOOK"],
    }));
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      "general",
      undefined
    );
  });

  it("returns 500 when AI returns null", async () => {
    mockGenerate.mockResolvedValue(null as never);
    const res = await POST(makeRequest({
      productName: "Premium Coffee Blend",
      productDescription: "A delicious coffee blend made from the finest ethically-sourced beans.",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(500);
  });

  it("returns 500 on unexpected AI error", async () => {
    mockGenerate.mockRejectedValue(new Error("AI service unavailable"));
    const res = await POST(makeRequest({
      productName: "Premium Coffee Blend",
      productDescription: "A delicious coffee blend made from the finest ethically-sourced beans.",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(500);
  });
});
