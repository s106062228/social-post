jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

import { TwitterAdapter } from "../twitter";
import { LinkedInAdapter } from "../linkedin";
import { MediaType } from "@prisma/client";

const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

beforeEach(() => {
  mockFetch.mockReset();
});

function ok(data: unknown, status = 200) {
  return Promise.resolve({
    ok: true,
    status,
    statusText: "OK",
    json: () => Promise.resolve(data),
    headers: new Headers({ "content-type": "image/jpeg" }),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  });
}

function fail(data: unknown, status = 400) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve(data),
    headers: new Headers(),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  });
}

const ACCOUNT_ID = "twitter_user_123";
const TOKEN = "test_token";
const TWEET_ID = "1234567890123456789";

// ── Twitter Poll Tests ────────────────────────────────────────────────────────

describe("TwitterAdapter – poll support", () => {
  let adapter: TwitterAdapter;

  beforeEach(() => {
    adapter = new TwitterAdapter();
  });

  it("builds correct API body with poll field and duration in minutes", async () => {
    mockFetch.mockReturnValueOnce(ok({ data: { id: TWEET_ID, text: "Poll tweet" } }));

    await adapter.publish(
      {
        content: "Which is better?",
        mediaType: MediaType.NONE,
        mediaUrls: [],
        poll: { question: "Which is better?", options: ["Option A", "Option B"], durationHours: 24 },
      },
      ACCOUNT_ID,
      TOKEN
    );

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/2/tweets");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string) as {
      text: string;
      poll: { options: { label: string }[]; duration_minutes: number };
    };
    expect(body.text).toBe("Which is better?");
    expect(body.poll).toBeDefined();
    expect(body.poll.duration_minutes).toBe(1440); // 24 * 60
    expect(body.poll.options).toEqual([{ label: "Option A" }, { label: "Option B" }]);
  });

  it("does not upload media when poll is present", async () => {
    mockFetch.mockReturnValueOnce(ok({ data: { id: TWEET_ID, text: "Poll tweet" } }));

    await adapter.publish(
      {
        content: "Pick one",
        mediaType: MediaType.IMAGE,
        mediaUrls: ["https://example.com/image.jpg"],
        poll: { question: "Pick one", options: ["Yes", "No"], durationHours: 6 },
      },
      ACCOUNT_ID,
      TOKEN
    );

    // Only one fetch call — no media upload
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      poll: { duration_minutes: number };
      media?: unknown;
    };
    expect(body.poll).toBeDefined();
    expect(body.poll.duration_minutes).toBe(360); // 6 * 60
    expect(body.media).toBeUndefined();
  });

  it("throws when poll has fewer than 2 options", async () => {
    await expect(
      adapter.publish(
        {
          content: "Poll with 1 option",
          mediaType: MediaType.NONE,
          mediaUrls: [],
          poll: { question: "Q?", options: ["Only one"], durationHours: 24 },
        },
        ACCOUNT_ID,
        TOKEN
      )
    ).rejects.toThrow("at least 2 options");
  });

  it("throws when poll has more than 4 options", async () => {
    await expect(
      adapter.publish(
        {
          content: "Poll with 5 options",
          mediaType: MediaType.NONE,
          mediaUrls: [],
          poll: { question: "Q?", options: ["A", "B", "C", "D", "E"], durationHours: 24 },
        },
        ACCOUNT_ID,
        TOKEN
      )
    ).rejects.toThrow("maximum of 4 options");
  });

  it("publishes without poll when poll is undefined", async () => {
    mockFetch.mockReturnValueOnce(ok({ data: { id: TWEET_ID, text: "Regular tweet" } }));

    const result = await adapter.publish(
      { content: "Regular tweet", mediaType: MediaType.NONE, mediaUrls: [] },
      ACCOUNT_ID,
      TOKEN
    );

    expect(result.platformPostId).toBe(TWEET_ID);
    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      poll?: unknown;
    };
    expect(body.poll).toBeUndefined();
  });
});

// ── LinkedIn Poll Tests ───────────────────────────────────────────────────────

describe("LinkedInAdapter – poll support", () => {
  let adapter: LinkedInAdapter;

  beforeEach(() => {
    adapter = new LinkedInAdapter();
  });

  it("builds correct API body with poll content block", async () => {
    const POST_URN = "urn:li:ugcPost:123456";
    mockFetch.mockReturnValueOnce(ok({ id: POST_URN }));

    await adapter.publish(
      {
        content: "Take our poll!",
        mediaType: MediaType.NONE,
        mediaUrls: [],
        poll: { question: "Favourite language?", options: ["TypeScript", "Python"], durationHours: 24 },
      },
      "urn:li:person:abc123",
      TOKEN
    );

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/rest/posts");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string) as {
      commentary: string;
      content: { poll: { question: string; options: { text: string }[]; settings: { duration: string } } };
    };
    expect(body.commentary).toBe("Favourite language?");
    expect(body.content.poll).toBeDefined();
    expect(body.content.poll.question).toBe("Favourite language?");
    expect(body.content.poll.options).toEqual([{ text: "TypeScript" }, { text: "Python" }]);
    expect(body.content.poll.settings.duration).toBe("ONE_DAY");
  });

  it("maps durationHours to LinkedIn duration string: 72h → THREE_DAYS", async () => {
    const POST_URN = "urn:li:ugcPost:789";
    mockFetch.mockReturnValueOnce(ok({ id: POST_URN }));

    await adapter.publish(
      {
        content: "3-day poll",
        mediaType: MediaType.NONE,
        mediaUrls: [],
        poll: { question: "3-day question?", options: ["Yes", "No"], durationHours: 72 },
      },
      "urn:li:person:abc123",
      TOKEN
    );

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      content: { poll: { settings: { duration: string } } };
    };
    expect(body.content.poll.settings.duration).toBe("THREE_DAYS");
  });

  it("maps durationHours to LinkedIn duration string: 168h → ONE_WEEK", async () => {
    mockFetch.mockReturnValueOnce(ok({ id: "urn:li:ugcPost:week" }));

    await adapter.publish(
      {
        content: "Weekly poll",
        mediaType: MediaType.NONE,
        mediaUrls: [],
        poll: { question: "Which week?", options: ["This week", "Next week"], durationHours: 168 },
      },
      "urn:li:person:abc123",
      TOKEN
    );

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      content: { poll: { settings: { duration: string } } };
    };
    expect(body.content.poll.settings.duration).toBe("ONE_WEEK");
  });

  it("publishes a normal text post when no poll is provided", async () => {
    mockFetch.mockReturnValueOnce(ok({ id: "urn:li:ugcPost:noPolls" }));

    const result = await adapter.publish(
      { content: "Just a text post.", mediaType: MediaType.NONE, mediaUrls: [] },
      "urn:li:person:abc123",
      TOKEN
    );

    expect(result.platformPostId).toBe("urn:li:ugcPost:noPolls");
    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      commentary: string;
      content?: unknown;
    };
    expect(body.commentary).toBe("Just a text post.");
    expect(body.content).toBeUndefined();
  });
});
