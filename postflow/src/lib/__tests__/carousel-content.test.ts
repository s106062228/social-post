import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock("@/lib/ai", () => ({
  generateCarouselContent: jest.fn(),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err: unknown) =>
    Response.json({ error: String(err) }, { status: 500 })
  ),
}));

import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateCarouselContent } from "@/lib/ai";
import { POST } from "@/app/api/ai/carousel-content/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockRl = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockGenerate = generateCarouselContent as jest.MockedFunction<typeof generateCarouselContent>;

const rlAllow = { success: true, limit: 60, remaining: 59, resetAt: new Date() };
const rlDeny  = { success: false, limit: 60, remaining: 0, resetAt: new Date() };

const mockCarousel = {
  title: "5 Tips for Growing Your Instagram",
  coverSlide: {
    headline: "Stop Scrolling & Start Growing 🚀",
    subtitle: "5 proven strategies that actually work",
  },
  slides: [
    {
      slideNumber: 1,
      headline: "Consistency Is Everything",
      bodyText: "Post at least 3 times a week to stay top-of-mind. Use a content calendar to plan ahead and avoid last-minute scrambling.",
      visualDescription: "A calendar graphic with checkmarks on posting days",
      keyTakeaway: "Consistent posting = 3x more followers in 90 days",
    },
    {
      slideNumber: 2,
      headline: "Engagement Beats Reach",
      bodyText: "Reply to every comment in the first hour. The algorithm rewards active conversations by showing your content to more people.",
      visualDescription: "Chat bubble icons with heart emojis",
      keyTakeaway: "1 hour of engagement = 50% more organic reach",
    },
  ],
  closingSlide: {
    cta: "Save this post and share with a friend who needs this!",
    hashtags: ["#instagramgrowth", "#socialmediatips", "#contentcreator"],
  },
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/carousel-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/carousel-content", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user1" } } as never);
    mockRl.mockResolvedValue(rlAllow as never);
    mockGenerate.mockResolvedValue(mockCarousel as never);
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(makeRequest({
      topic: "Instagram growth tips",
      slideCount: 5,
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockRl.mockResolvedValue(rlDeny as never);
    const res = await POST(makeRequest({
      topic: "Instagram growth tips",
      slideCount: 5,
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({
      topic: "Instagram growth tips",
      slideCount: 5,
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(503);
  });

  it("returns 400 when JSON body is invalid", async () => {
    const req = new NextRequest("http://localhost/api/ai/carousel-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when topic is missing", async () => {
    const res = await POST(makeRequest({
      slideCount: 5,
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when topic is too short", async () => {
    const res = await POST(makeRequest({
      topic: "A",
      slideCount: 5,
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    const res = await POST(makeRequest({
      topic: "Instagram growth tips",
      slideCount: 5,
      platforms: [],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when slideCount is below minimum", async () => {
    const res = await POST(makeRequest({
      topic: "Instagram growth tips",
      slideCount: 1,
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when slideCount exceeds maximum", async () => {
    const res = await POST(makeRequest({
      topic: "Instagram growth tips",
      slideCount: 20,
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with carousel on success", async () => {
    const res = await POST(makeRequest({
      topic: "Instagram growth tips",
      slideCount: 5,
      platforms: ["INSTAGRAM", "LINKEDIN"],
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as { carousel: typeof mockCarousel };
    expect(data.carousel).toBeDefined();
    expect(data.carousel.title).toBe(mockCarousel.title);
  });

  it("carousel response has coverSlide, slides, and closingSlide", async () => {
    const res = await POST(makeRequest({
      topic: "Instagram growth tips",
      slideCount: 5,
      platforms: ["INSTAGRAM"],
    }));
    const data = await res.json() as { carousel: typeof mockCarousel };
    expect(data.carousel.coverSlide).toBeDefined();
    expect(Array.isArray(data.carousel.slides)).toBe(true);
    expect(data.carousel.closingSlide).toBeDefined();
  });

  it("passes tone and audience to AI function", async () => {
    await POST(makeRequest({
      topic: "Instagram growth tips",
      slideCount: 5,
      platforms: ["INSTAGRAM"],
      tone: "professional",
      audience: "small business owners",
    }));
    expect(mockGenerate).toHaveBeenCalledWith(
      "Instagram growth tips",
      5,
      ["INSTAGRAM"],
      "professional",
      "small business owners"
    );
  });

  it("defaults slideCount to 5 when not provided", async () => {
    await POST(makeRequest({
      topic: "Instagram growth tips",
      platforms: ["INSTAGRAM"],
    }));
    expect(mockGenerate).toHaveBeenCalledWith(
      "Instagram growth tips",
      5,
      expect.any(Array),
      undefined,
      undefined
    );
  });

  it("returns 500 when AI returns null", async () => {
    mockGenerate.mockResolvedValue(null as never);
    const res = await POST(makeRequest({
      topic: "Instagram growth tips",
      slideCount: 5,
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(500);
  });

  it("returns 500 on unexpected AI error", async () => {
    mockGenerate.mockRejectedValue(new Error("API failure"));
    const res = await POST(makeRequest({
      topic: "Instagram growth tips",
      slideCount: 5,
      platforms: ["INSTAGRAM"],
    }));
    expect(res.status).toBe(500);
  });
});
