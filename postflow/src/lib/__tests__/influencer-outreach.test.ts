import { NextRequest } from "next/server";

jest.mock("@/lib/ai", () => ({
  generateInfluencerOutreach: jest.fn(),
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

import { POST } from "@/app/api/ai/influencer-outreach/route";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateInfluencerOutreach } from "@/lib/ai";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockApiLimiter = apiLimiter as jest.MockedFunction<typeof apiLimiter>;
const mockGenerateInfluencerOutreach = generateInfluencerOutreach as jest.MockedFunction<typeof generateInfluencerOutreach>;

const mockOutreach = {
  subject: "Collaboration Opportunity with Your Brand",
  emailBody: "Hi Jane,\n\nI came across your amazing content and would love to collaborate...",
  dmMessage: "Hey @jane_doe! Love your content. Would you be open to a collaboration? DM me! 🚀",
  followUpMessage: "Hi Jane, just following up on my previous message about a potential collaboration...",
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/influencer-outreach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/influencer-outreach", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV, ANTHROPIC_API_KEY: "test-key" };
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as Awaited<ReturnType<typeof auth>>);
    mockApiLimiter.mockResolvedValue({ success: true } as Awaited<ReturnType<typeof apiLimiter>>);
    mockGenerateInfluencerOutreach.mockResolvedValue(mockOutreach);
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({
      influencerName: "Jane Doe",
      handle: "jane_doe",
      campaignBrief: "We want to promote our new fitness app",
    }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false } as Awaited<ReturnType<typeof apiLimiter>>);
    const res = await POST(makeRequest({
      influencerName: "Jane Doe",
      handle: "jane_doe",
      campaignBrief: "We want to promote our new fitness app",
    }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({
      influencerName: "Jane Doe",
      handle: "jane_doe",
      campaignBrief: "We want to promote our new fitness app",
    }));
    expect(res.status).toBe(503);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("not configured");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/ai/influencer-outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when influencerName is missing", async () => {
    const res = await POST(makeRequest({
      handle: "jane_doe",
      campaignBrief: "We want to promote our new fitness app",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when campaignBrief is too short", async () => {
    const res = await POST(makeRequest({
      influencerName: "Jane Doe",
      handle: "jane_doe",
      campaignBrief: "short",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with outreach result on success", async () => {
    const res = await POST(makeRequest({
      influencerName: "Jane Doe",
      handle: "jane_doe",
      platform: "Instagram",
      followerCount: 50000,
      niche: "fitness",
      campaignBrief: "We want to promote our new fitness app to health-conscious audiences",
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as { outreach: typeof mockOutreach };
    expect(data.outreach.subject).toBe(mockOutreach.subject);
    expect(data.outreach.emailBody).toBe(mockOutreach.emailBody);
    expect(data.outreach.dmMessage).toBe(mockOutreach.dmMessage);
    expect(data.outreach.followUpMessage).toBe(mockOutreach.followUpMessage);
  });

  it("passes tone to generateInfluencerOutreach", async () => {
    await POST(makeRequest({
      influencerName: "Jane Doe",
      handle: "jane_doe",
      campaignBrief: "We want to promote our new fitness app to health-conscious audiences",
      tone: "professional",
    }));
    expect(mockGenerateInfluencerOutreach).toHaveBeenCalledWith(
      "Jane Doe",
      "jane_doe",
      null,
      null,
      null,
      "We want to promote our new fitness app to health-conscious audiences",
      "professional"
    );
  });

  it("returns 500 when generateInfluencerOutreach returns null", async () => {
    mockGenerateInfluencerOutreach.mockResolvedValue(null);
    const res = await POST(makeRequest({
      influencerName: "Jane Doe",
      handle: "jane_doe",
      campaignBrief: "We want to promote our new fitness app to health-conscious audiences",
    }));
    expect(res.status).toBe(500);
  });
});
