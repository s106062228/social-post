// Mock nodemailer before any imports that pull it in.
const mockSendMail = jest.fn<Promise<unknown>, [unknown]>();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

// Mock @prisma/client enums (Prisma client isn't generated in the test env)
jest.mock("@prisma/client", () => ({
  PostStatus: {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    PUBLISHING: "PUBLISHING",
    PUBLISHED: "PUBLISHED",
    PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
    FAILED: "FAILED",
  },
  PublishStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PUBLISHED: "PUBLISHED",
    FAILED: "FAILED",
  },
}));

// Mock Prisma client
const mockFindUnique = jest.fn();
jest.mock("@/lib/db", () => ({
  prisma: { post: { findUnique: mockFindUnique } },
}));

// Mock logger so pino-pretty isn't needed
jest.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import {
  sendEmail,
  notifyPostOutcome,
  buildPublishedEmail,
  buildFailedEmail,
  buildPartialEmail,
  resetTransporter,
} from "../email";

// Plain-string enum mirrors (match the mock above)
const PostStatus = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  PUBLISHING: "PUBLISHING",
  PUBLISHED: "PUBLISHED",
  PARTIALLY_PUBLISHED: "PARTIALLY_PUBLISHED",
  FAILED: "FAILED",
} as const;
type PostStatusValue = (typeof PostStatus)[keyof typeof PostStatus];

const PublishStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
} as const;
type PublishStatusValue = (typeof PublishStatus)[keyof typeof PublishStatus];

// ── Helpers ────────────────────────────────────────────────────────────────────

function setSmtpEnv() {
  process.env.SMTP_HOST = "smtp.test.local";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "user@test.local";
  process.env.SMTP_PASS = "secret";
  process.env.SMTP_FROM = "PostFlow <noreply@test.local>";
}

function clearSmtpEnv() {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
}

// ── HTML template tests ────────────────────────────────────────────────────────

describe("buildPublishedEmail", () => {
  it("mentions the platform count", () => {
    const html = buildPublishedEmail("Hello world", 3);
    expect(html).toContain("3");
    expect(html).toContain("platforms");
  });

  it("truncates long content to an excerpt", () => {
    const long = "A".repeat(300);
    const html = buildPublishedEmail(long, 1);
    expect(html).not.toContain(long);
    expect(html).toContain("…");
  });

  it("uses singular 'platform' for count 1", () => {
    const html = buildPublishedEmail("short", 1);
    expect(html).toContain("platform.");
    expect(html).not.toContain("platforms");
  });
});

describe("buildFailedEmail", () => {
  it("lists each error", () => {
    const html = buildFailedEmail("content", [
      "FACEBOOK: rate limit",
      "INSTAGRAM: bad token",
    ]);
    expect(html).toContain("FACEBOOK: rate limit");
    expect(html).toContain("INSTAGRAM: bad token");
  });

  it("renders without error list when errors array is empty", () => {
    const html = buildFailedEmail("content", []);
    expect(html).not.toContain("<ul>");
  });
});

describe("buildPartialEmail", () => {
  it("shows published and failed counts", () => {
    const html = buildPartialEmail("content", 2, 1);
    expect(html).toContain("2");
    expect(html).toContain("1");
  });
});

// ── sendEmail tests ────────────────────────────────────────────────────────────

describe("sendEmail", () => {
  beforeEach(() => {
    resetTransporter();
    mockSendMail.mockResolvedValue({ messageId: "test-id" });
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
  });

  afterEach(() => {
    clearSmtpEnv();
    resetTransporter();
    jest.clearAllMocks();
  });

  it("returns false and skips sending when SMTP is not configured", async () => {
    clearSmtpEnv();
    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>test</p>",
    });
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("sends email and returns true when SMTP is configured", async () => {
    setSmtpEnv();
    const result = await sendEmail({
      to: "user@example.com",
      subject: "Hello",
      html: "<p>body</p>",
    });
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: "Hello",
        html: "<p>body</p>",
        from: "PostFlow <noreply@test.local>",
      })
    );
  });

  it("returns false and does not throw when sendMail rejects", async () => {
    setSmtpEnv();
    mockSendMail.mockRejectedValue(new Error("SMTP connection refused"));
    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>test</p>",
    });
    expect(result).toBe(false);
  });
});

// ── notifyPostOutcome tests ────────────────────────────────────────────────────

describe("notifyPostOutcome", () => {
  const basePost = {
    id: "post-1",
    content: "Hello world",
    user: { email: "owner@example.com", emailNotifications: true },
    publishResults: [
      {
        status: PublishStatus.PUBLISHED as PublishStatusValue,
        error: null,
        platform: "FACEBOOK",
      },
    ],
  };

  beforeEach(() => {
    resetTransporter();
    setSmtpEnv();
    mockSendMail.mockResolvedValue({ messageId: "test-id" });
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  afterEach(() => {
    clearSmtpEnv();
    resetTransporter();
    jest.clearAllMocks();
  });

  it("does not query DB for non-terminal statuses", async () => {
    notifyPostOutcome("post-1", PostStatus.PUBLISHING as PostStatusValue);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("sends published email when status is PUBLISHED", async () => {
    mockFindUnique.mockResolvedValue(basePost);
    notifyPostOutcome("post-1", PostStatus.PUBLISHED as PostStatusValue);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject: expect.stringContaining("published"),
      })
    );
  });

  it("sends failed email when status is FAILED", async () => {
    const failedPost = {
      ...basePost,
      publishResults: [
        {
          status: PublishStatus.FAILED as PublishStatusValue,
          error: "Rate limit exceeded",
          platform: "INSTAGRAM",
        },
      ],
    };
    mockFindUnique.mockResolvedValue(failedPost);
    notifyPostOutcome("post-1", PostStatus.FAILED as PostStatusValue);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject: expect.stringContaining("failed"),
      })
    );
  });

  it("sends partial email when status is PARTIALLY_PUBLISHED", async () => {
    const partialPost = {
      ...basePost,
      publishResults: [
        {
          status: PublishStatus.PUBLISHED as PublishStatusValue,
          error: null,
          platform: "FACEBOOK",
        },
        {
          status: PublishStatus.FAILED as PublishStatusValue,
          error: "Bad token",
          platform: "INSTAGRAM",
        },
      ],
    };
    mockFindUnique.mockResolvedValue(partialPost);
    notifyPostOutcome(
      "post-1",
      PostStatus.PARTIALLY_PUBLISHED as PostStatusValue
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject: expect.stringContaining("partially"),
      })
    );
  });

  it("skips email when user has emailNotifications disabled", async () => {
    const noNotifPost = {
      ...basePost,
      user: { email: "owner@example.com", emailNotifications: false },
    };
    mockFindUnique.mockResolvedValue(noNotifPost);
    notifyPostOutcome("post-1", PostStatus.PUBLISHED as PostStatusValue);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("does not throw when post is not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(() =>
      notifyPostOutcome("missing-post", PostStatus.PUBLISHED as PostStatusValue)
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("does not throw when Prisma rejects", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB connection lost"));
    expect(() =>
      notifyPostOutcome("post-1", PostStatus.PUBLISHED as PostStatusValue)
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
