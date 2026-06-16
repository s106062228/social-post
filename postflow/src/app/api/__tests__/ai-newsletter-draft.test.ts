import { POST } from "../ai/newsletter-draft/route";
import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn(() => ({})),
}));
jest.mock("@/lib/errors", () => ({
  handleRouteError: jest.fn((err) =>
    Response.json({ error: "Internal server error" }, { status: 500 })
  ),
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/ai", () => ({
  generateNewsletterDraft: jest.fn(),
}));
jest.mock("@/lib/db", () => ({
  prisma: {
    publishResult: {
      findMany: jest.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateNewsletterDraft } from "@/lib/ai";
import { prisma } from "@/lib/db";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockGenerateNewsletterDraft = generateNewsletterDraft as jest.Mock;
const mockFindMany = prisma.publishResult.findMany as jest.Mock;

const mockSession = { user: { id: "user-1", email: "test@example.com" } };
const mockRlSuccess = { success: true };

const mockNewsletter = {
  subject: "Your Weekly Social Digest",
  intro: "Here is what we published this week.",
  sections: [
    {
      headline: "Top Post of the Week",
      excerpt: "A great post about our product.",
      platform: "FACEBOOK",
      content: "Full content here...",
    },
  ],
  keyTakeaways: ["Engagement is up", "Reach is growing"],
  conclusion: "Thank you for reading!",
  estimatedReadTime: 3,
};

const mockPublishResults = [
  {
    platform: "FACEBOOK",
    publishedAt: new Date("2026-06-10T10:00:00Z"),
    post: { content: "This is a great post about our product launch!" },
  },
  {
    platform: "INSTAGRAM",
    publishedAt: new Date("2026-06-11T12:00:00Z"),
    post: { content: "Check out our latest update on Instagram!" },
  },
];

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ai/newsletter-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(mockSession);
  mockApiLimiter.mockResolvedValue(mockRlSuccess);
  mockFindMany.mockResolvedValue(mockPublishResults);
  mockGenerateNewsletterDraft.mockResolvedValue(mockNewsletter);
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("POST /api/ai/newsletter-draft", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ period: "week" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue({ success: false });
    const res = await POST(makeRequest({ period: "week" }));
    expect(res.status).toBe(429);
  });

  it("returns 503 when AI not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({ period: "week" }));
    expect(res.status).toBe(503);
  });

  it("returns 400 when period is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when period is invalid", async () => {
    const res = await POST(makeRequest({ period: "quarterly" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when custom period is missing from/to", async () => {
    const res = await POST(makeRequest({ period: "custom" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when custom period has invalid date format", async () => {
    const res = await POST(
      makeRequest({ period: "custom", from: "not-a-date", to: "2026-06-15" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with success shape for week period", async () => {
    const res = await POST(makeRequest({ period: "week" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("newsletter");
    expect(data).toHaveProperty("postCount");
    expect(data.postCount).toBe(2);
  });

  it("returns newsletter with all required fields", async () => {
    const res = await POST(makeRequest({ period: "week" }));
    const data = await res.json();
    const { newsletter } = data;
    expect(newsletter).toHaveProperty("subject");
    expect(newsletter).toHaveProperty("intro");
    expect(newsletter).toHaveProperty("conclusion");
    expect(newsletter).toHaveProperty("estimatedReadTime");
  });

  it("returns newsletter with sections array", async () => {
    const res = await POST(makeRequest({ period: "week" }));
    const data = await res.json();
    expect(Array.isArray(data.newsletter.sections)).toBe(true);
    expect(data.newsletter.sections.length).toBeGreaterThan(0);
    expect(data.newsletter.sections[0]).toHaveProperty("headline");
    expect(data.newsletter.sections[0]).toHaveProperty("platform");
  });

  it("returns newsletter with keyTakeaways array", async () => {
    const res = await POST(makeRequest({ period: "week" }));
    const data = await res.json();
    expect(Array.isArray(data.newsletter.keyTakeaways)).toBe(true);
  });

  it("returns 500 when AI returns null", async () => {
    mockGenerateNewsletterDraft.mockResolvedValue(null);
    const res = await POST(makeRequest({ period: "week" }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when AI throws an error", async () => {
    mockGenerateNewsletterDraft.mockRejectedValue(new Error("AI failure"));
    const res = await POST(makeRequest({ period: "week" }));
    expect(res.status).toBe(500);
  });
});
