import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock("@/lib/ai", () => ({
  generateAudienceQuestions: jest.fn(),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err: unknown) =>
    Response.json({ error: String(err) }, { status: 500 })
  ),
}));

import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateAudienceQuestions } from "@/lib/ai";
import { POST } from "@/app/api/ai/audience-questions/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockRl = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockGenerate = generateAudienceQuestions as jest.MockedFunction<typeof generateAudienceQuestions>;

const rlAllow = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const rlDeny  = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

const mockResult = {
  topic: "vegan nutrition",
  questions: [
    {
      question: "Do vegans get enough protein?",
      answer: "Yes, plant-based proteins include beans, lentils, tofu, and more.",
      suggestedPost: "🌱 Wondering if vegans get enough protein? Absolutely! Beans, lentils, tempeh, and tofu are packed with protein. #VeganProtein #PlantBased",
      category: "misconception" as const,
    },
    {
      question: "How do I get vitamin B12 on a vegan diet?",
      answer: "B12 is found in fortified foods and supplements.",
      suggestedPost: "💊 B12 tip for vegans: Get it from fortified plant milks, nutritional yeast, or a daily supplement! #VeganHealth #B12",
      category: "how-to" as const,
    },
  ],
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/audience-questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/audience-questions", () => {
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
      topic: "vegan nutrition",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockRl.mockResolvedValue(rlDeny as never);
    const res = await POST(makeRequest({
      topic: "vegan nutrition",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({
      topic: "vegan nutrition",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/ai/audience-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when topic is missing", async () => {
    const res = await POST(makeRequest({
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when topic is too short", async () => {
    const res = await POST(makeRequest({
      topic: "a",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms is empty", async () => {
    const res = await POST(makeRequest({
      topic: "vegan nutrition",
      platforms: [],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with questions and topic on success", async () => {
    const res = await POST(makeRequest({
      topic: "vegan nutrition",
      platforms: ["FACEBOOK", "INSTAGRAM"],
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as typeof mockResult;
    expect(data.topic).toBe("vegan nutrition");
    expect(data.questions).toHaveLength(2);
    expect(data.questions[0].question).toBeDefined();
    expect(data.questions[0].answer).toBeDefined();
    expect(data.questions[0].suggestedPost).toBeDefined();
    expect(data.questions[0].category).toBe("misconception");
  });

  it("passes count and context to AI function", async () => {
    await POST(makeRequest({
      topic: "vegan nutrition",
      platforms: ["FACEBOOK"],
      count: 7,
      context: "focus on beginners",
    }));
    expect(mockGenerate).toHaveBeenCalledWith(
      "vegan nutrition",
      ["FACEBOOK"],
      7,
      "focus on beginners"
    );
  });

  it("uses default count of 5 when not specified", async () => {
    await POST(makeRequest({
      topic: "vegan nutrition",
      platforms: ["FACEBOOK"],
    }));
    expect(mockGenerate).toHaveBeenCalledWith(
      "vegan nutrition",
      ["FACEBOOK"],
      5,
      undefined
    );
  });

  it("returns 500 when AI returns null", async () => {
    mockGenerate.mockResolvedValue(null as never);
    const res = await POST(makeRequest({
      topic: "vegan nutrition",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(500);
  });

  it("returns 500 on unexpected AI error", async () => {
    mockGenerate.mockRejectedValue(new Error("AI service unavailable"));
    const res = await POST(makeRequest({
      topic: "vegan nutrition",
      platforms: ["FACEBOOK"],
    }));
    expect(res.status).toBe(500);
  });
});
