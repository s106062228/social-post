import { NextRequest } from "next/server";

const mockAuth = jest.fn();
const mockRateLimit = jest.fn();
const mockPrisma = {
  aiChatMessage: {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  post: { count: jest.fn() },
  socialAccount: { count: jest.fn() },
  $transaction: jest.fn(),
};
const mockChatWithAssistant = jest.fn();

jest.mock("@/auth", () => ({ auth: mockAuth }));
jest.mock("@/lib/rate-limit", () => ({ rateLimit: mockRateLimit }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/ai", () => ({ chatWithAssistant: mockChatWithAssistant }));

describe("GET /api/ai/chat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockRateLimit.mockResolvedValue({ success: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/ai/chat/route");
    const req = new NextRequest("http://localhost/api/ai/chat");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockResolvedValue({ success: false });
    const { GET } = await import("@/app/api/ai/chat/route");
    const req = new NextRequest("http://localhost/api/ai/chat");
    const res = await GET(req);
    expect(res.status).toBe(429);
  });

  it("returns message history", async () => {
    mockPrisma.aiChatMessage.findMany.mockResolvedValue([
      { id: "m1", role: "user", content: "hello", createdAt: new Date() },
      { id: "m2", role: "assistant", content: "hi there", createdAt: new Date() },
    ]);
    const { GET } = await import("@/app/api/ai/chat/route");
    const req = new NextRequest("http://localhost/api/ai/chat");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json() as { messages: unknown[] };
    expect(data.messages).toHaveLength(2);
  });
});

describe("POST /api/ai/chat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockRateLimit.mockResolvedValue({ success: true });
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockPrisma.aiChatMessage.findMany.mockResolvedValue([]);
    mockPrisma.post.count.mockResolvedValue(5);
    mockPrisma.socialAccount.count.mockResolvedValue(2);
    mockPrisma.$transaction.mockResolvedValue([]);
    mockPrisma.aiChatMessage.count.mockResolvedValue(2);
    mockChatWithAssistant.mockResolvedValue("Here are some ideas...");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/ai/chat/route");
    const req = new NextRequest("http://localhost/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message: "hello" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 503 when AI not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { POST } = await import("@/app/api/ai/chat/route");
    const req = new NextRequest("http://localhost/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message: "hello" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid body", async () => {
    const { POST } = await import("@/app/api/ai/chat/route");
    const req = new NextRequest("http://localhost/api/ai/chat", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns AI reply on success", async () => {
    const { POST } = await import("@/app/api/ai/chat/route");
    const req = new NextRequest("http://localhost/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Give me content ideas" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json() as { reply: string };
    expect(data.reply).toBe("Here are some ideas...");
  });

  it("passes conversation history to AI", async () => {
    mockPrisma.aiChatMessage.findMany.mockResolvedValue([
      { role: "user", content: "previous question" },
      { role: "assistant", content: "previous answer" },
    ]);
    const { POST } = await import("@/app/api/ai/chat/route");
    const req = new NextRequest("http://localhost/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message: "follow up" }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req);
    const callArgs = mockChatWithAssistant.mock.calls[0] as [Array<{role: string; content: string}>, string];
    expect(callArgs[0]).toHaveLength(3); // 2 history + 1 new
  });
});

describe("DELETE /api/ai/chat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockRateLimit.mockResolvedValue({ success: true });
    mockPrisma.aiChatMessage.deleteMany.mockResolvedValue({ count: 5 });
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/ai/chat/route");
    const req = new NextRequest("http://localhost/api/ai/chat", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it("clears history and returns count", async () => {
    const { DELETE } = await import("@/app/api/ai/chat/route");
    const req = new NextRequest("http://localhost/api/ai/chat", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const data = await res.json() as { deleted: number };
    expect(data.deleted).toBe(5);
  });
});
