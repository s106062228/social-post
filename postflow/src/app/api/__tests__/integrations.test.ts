jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    slackIntegration: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    discordIntegration: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import {
  GET as listSlack,
  POST as createSlack,
} from "@/app/api/integrations/slack/route";
import {
  DELETE as deleteSlack,
  PATCH as toggleSlack,
} from "@/app/api/integrations/slack/[id]/route";
import {
  GET as listDiscord,
  POST as createDiscord,
} from "@/app/api/integrations/discord/route";
import {
  DELETE as deleteDiscord,
  PATCH as toggleDiscord,
} from "@/app/api/integrations/discord/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;

const slackFindMany = prisma.slackIntegration.findMany as jest.Mock;
const slackFindUnique = prisma.slackIntegration.findUnique as jest.Mock;
const slackCreate = prisma.slackIntegration.create as jest.Mock;
const slackUpdate = prisma.slackIntegration.update as jest.Mock;
const slackDelete = prisma.slackIntegration.delete as jest.Mock;

const discordFindMany = prisma.discordIntegration.findMany as jest.Mock;
const discordFindUnique = prisma.discordIntegration.findUnique as jest.Mock;
const discordCreate = prisma.discordIntegration.create as jest.Mock;
const discordUpdate = prisma.discordIntegration.update as jest.Mock;
const discordDelete = prisma.discordIntegration.delete as jest.Mock;

const USER_ID = "cluser0001";
const OTHER_ID = "cluser9999";
const SLACK_ID = "clslack001";
const DISCORD_ID = "cldiscord001";
const AUTHED = { user: { id: USER_ID, email: "user@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_SLACK = {
  id: SLACK_ID,
  userId: USER_ID,
  workspaceName: "My Team",
  webhookUrl: "https://hooks.slack.com/services/T000/B000/xxxx",
  events: ["post.published", "post.failed"],
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const BASE_DISCORD = {
  id: DISCORD_ID,
  userId: USER_ID,
  channelName: "#alerts",
  webhookUrl: "https://discord.com/api/webhooks/000/xxxx",
  events: ["post.published"],
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReq(url: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }
      : {}),
  });
}

const SLACK_PARAMS = Promise.resolve({ id: SLACK_ID });
const DISCORD_PARAMS = Promise.resolve({ id: DISCORD_ID });
const SHORT_PARAMS = Promise.resolve({ id: "short" });

beforeEach(() => jest.clearAllMocks());

// ════════════════════════════════════════════════════════════════════════════
// Slack — GET
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/integrations/slack", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listSlack();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);
    const res = await listSlack();
    expect(res.status).toBe(429);
  });

  it("returns integrations list and validEvents on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    slackFindMany.mockResolvedValueOnce([BASE_SLACK]);

    const res = await listSlack();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      integrations: typeof BASE_SLACK[];
      validEvents: string[];
    };
    expect(data.integrations).toHaveLength(1);
    expect(data.integrations[0].workspaceName).toBe("My Team");
    expect(data.validEvents).toContain("post.published");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Slack — POST
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/integrations/slack", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createSlack(
      makeReq("http://localhost/api/integrations/slack", "POST", {
        workspaceName: "X",
        webhookUrl: "https://hooks.slack.com/x",
        events: ["post.published"],
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const req = new NextRequest("http://localhost/api/integrations/slack", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await createSlack(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when webhookUrl is not HTTPS", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createSlack(
      makeReq("http://localhost/api/integrations/slack", "POST", {
        workspaceName: "My Team",
        webhookUrl: "http://hooks.slack.com/x",
        events: ["post.published"],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when events array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createSlack(
      makeReq("http://localhost/api/integrations/slack", "POST", {
        workspaceName: "My Team",
        webhookUrl: "https://hooks.slack.com/x",
        events: [],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when workspaceName is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createSlack(
      makeReq("http://localhost/api/integrations/slack", "POST", {
        workspaceName: "",
        webhookUrl: "https://hooks.slack.com/x",
        events: ["post.published"],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 201 on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    slackCreate.mockResolvedValueOnce(BASE_SLACK);

    const res = await createSlack(
      makeReq("http://localhost/api/integrations/slack", "POST", {
        workspaceName: "My Team",
        webhookUrl: "https://hooks.slack.com/services/T/B/x",
        events: ["post.published"],
      })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_SLACK;
    expect(data.id).toBe(SLACK_ID);
    expect(data.workspaceName).toBe("My Team");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Slack — DELETE
// ════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/integrations/slack/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteSlack(
      makeReq(`http://localhost/api/integrations/slack/${SLACK_ID}`, "DELETE"),
      { params: SLACK_PARAMS }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for short id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await deleteSlack(
      makeReq("http://localhost/api/integrations/slack/short", "DELETE"),
      { params: SHORT_PARAMS }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when owned by another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    slackFindUnique.mockResolvedValueOnce({ userId: OTHER_ID });
    const res = await deleteSlack(
      makeReq(`http://localhost/api/integrations/slack/${SLACK_ID}`, "DELETE"),
      { params: SLACK_PARAMS }
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    slackFindUnique.mockResolvedValueOnce({ userId: USER_ID });
    slackDelete.mockResolvedValueOnce(BASE_SLACK);
    const res = await deleteSlack(
      makeReq(`http://localhost/api/integrations/slack/${SLACK_ID}`, "DELETE"),
      { params: SLACK_PARAMS }
    );
    expect(res.status).toBe(204);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Slack — PATCH (toggle)
// ════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/integrations/slack/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await toggleSlack(
      makeReq(`http://localhost/api/integrations/slack/${SLACK_ID}`, "PATCH"),
      { params: SLACK_PARAMS }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown integration", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    slackFindUnique.mockResolvedValueOnce(null);
    const res = await toggleSlack(
      makeReq(`http://localhost/api/integrations/slack/${SLACK_ID}`, "PATCH"),
      { params: SLACK_PARAMS }
    );
    expect(res.status).toBe(404);
  });

  it("toggles isActive true → false", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    slackFindUnique.mockResolvedValueOnce({ userId: USER_ID, isActive: true });
    slackUpdate.mockResolvedValueOnce({ id: SLACK_ID, isActive: false });

    const res = await toggleSlack(
      makeReq(`http://localhost/api/integrations/slack/${SLACK_ID}`, "PATCH"),
      { params: SLACK_PARAMS }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isActive: boolean };
    expect(data.isActive).toBe(false);
  });

  it("toggles isActive false → true", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    slackFindUnique.mockResolvedValueOnce({ userId: USER_ID, isActive: false });
    slackUpdate.mockResolvedValueOnce({ id: SLACK_ID, isActive: true });

    const res = await toggleSlack(
      makeReq(`http://localhost/api/integrations/slack/${SLACK_ID}`, "PATCH"),
      { params: SLACK_PARAMS }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isActive: boolean };
    expect(data.isActive).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Discord — GET
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/integrations/discord", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listDiscord();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_EXCEEDED);
    const res = await listDiscord();
    expect(res.status).toBe(429);
  });

  it("returns integrations list and validEvents on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    discordFindMany.mockResolvedValueOnce([BASE_DISCORD]);

    const res = await listDiscord();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      integrations: typeof BASE_DISCORD[];
      validEvents: string[];
    };
    expect(data.integrations).toHaveLength(1);
    expect(data.integrations[0].channelName).toBe("#alerts");
    expect(data.validEvents).toContain("post.published");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Discord — POST
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/integrations/discord", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createDiscord(
      makeReq("http://localhost/api/integrations/discord", "POST", {
        channelName: "#alerts",
        webhookUrl: "https://discord.com/api/webhooks/x",
        events: ["post.published"],
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const req = new NextRequest(
      "http://localhost/api/integrations/discord",
      {
        method: "POST",
        body: "not-json",
        headers: { "Content-Type": "application/json" },
      }
    );
    const res = await createDiscord(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when webhookUrl is not HTTPS", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createDiscord(
      makeReq("http://localhost/api/integrations/discord", "POST", {
        channelName: "#alerts",
        webhookUrl: "http://discord.com/api/webhooks/x",
        events: ["post.published"],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when events array is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createDiscord(
      makeReq("http://localhost/api/integrations/discord", "POST", {
        channelName: "#alerts",
        webhookUrl: "https://discord.com/api/webhooks/x",
        events: [],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when channelName is empty", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createDiscord(
      makeReq("http://localhost/api/integrations/discord", "POST", {
        channelName: "",
        webhookUrl: "https://discord.com/api/webhooks/x",
        events: ["post.published"],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 201 on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    discordCreate.mockResolvedValueOnce(BASE_DISCORD);

    const res = await createDiscord(
      makeReq("http://localhost/api/integrations/discord", "POST", {
        channelName: "#alerts",
        webhookUrl: "https://discord.com/api/webhooks/000/xxxx",
        events: ["post.published"],
      })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as typeof BASE_DISCORD;
    expect(data.id).toBe(DISCORD_ID);
    expect(data.channelName).toBe("#alerts");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Discord — DELETE
// ════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/integrations/discord/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteDiscord(
      makeReq(
        `http://localhost/api/integrations/discord/${DISCORD_ID}`,
        "DELETE"
      ),
      { params: DISCORD_PARAMS }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for short id", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await deleteDiscord(
      makeReq("http://localhost/api/integrations/discord/short", "DELETE"),
      { params: SHORT_PARAMS }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when owned by another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    discordFindUnique.mockResolvedValueOnce({ userId: OTHER_ID });
    const res = await deleteDiscord(
      makeReq(
        `http://localhost/api/integrations/discord/${DISCORD_ID}`,
        "DELETE"
      ),
      { params: DISCORD_PARAMS }
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 on success", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    discordFindUnique.mockResolvedValueOnce({ userId: USER_ID });
    discordDelete.mockResolvedValueOnce(BASE_DISCORD);
    const res = await deleteDiscord(
      makeReq(
        `http://localhost/api/integrations/discord/${DISCORD_ID}`,
        "DELETE"
      ),
      { params: DISCORD_PARAMS }
    );
    expect(res.status).toBe(204);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Discord — PATCH (toggle)
// ════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/integrations/discord/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await toggleDiscord(
      makeReq(
        `http://localhost/api/integrations/discord/${DISCORD_ID}`,
        "PATCH"
      ),
      { params: DISCORD_PARAMS }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown integration", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    discordFindUnique.mockResolvedValueOnce(null);
    const res = await toggleDiscord(
      makeReq(
        `http://localhost/api/integrations/discord/${DISCORD_ID}`,
        "PATCH"
      ),
      { params: DISCORD_PARAMS }
    );
    expect(res.status).toBe(404);
  });

  it("toggles isActive true → false", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    discordFindUnique.mockResolvedValueOnce({ userId: USER_ID, isActive: true });
    discordUpdate.mockResolvedValueOnce({ id: DISCORD_ID, isActive: false });

    const res = await toggleDiscord(
      makeReq(
        `http://localhost/api/integrations/discord/${DISCORD_ID}`,
        "PATCH"
      ),
      { params: DISCORD_PARAMS }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isActive: boolean };
    expect(data.isActive).toBe(false);
  });

  it("toggles isActive false → true", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    discordFindUnique.mockResolvedValueOnce({
      userId: USER_ID,
      isActive: false,
    });
    discordUpdate.mockResolvedValueOnce({ id: DISCORD_ID, isActive: true });

    const res = await toggleDiscord(
      makeReq(
        `http://localhost/api/integrations/discord/${DISCORD_ID}`,
        "PATCH"
      ),
      { params: DISCORD_PARAMS }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { isActive: boolean };
    expect(data.isActive).toBe(true);
  });
});
