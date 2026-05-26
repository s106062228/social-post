jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

jest.mock("../auth/google-business-oauth", () => ({
  parseGoogleBusinessToken: (raw: string) => JSON.parse(raw),
}));

import { GoogleBusinessAdapter } from "../platforms/google-business";
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
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ "content-type": "application/json" }),
  });
}

function fail(data: unknown, status = 400) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  });
}

function noContent(status = 204) {
  return Promise.resolve({
    ok: true,
    status,
    statusText: "No Content",
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
    headers: new Headers(),
  });
}

const ACCESS_TOKEN = "ya29.google-business-access-token";
const LOCATION_NAME = "accounts/123456/locations/789";
const LOCAL_POST_NAME = `${LOCATION_NAME}/localPosts/post-abc-123`;

const TOKEN = JSON.stringify({
  accessToken: ACCESS_TOKEN,
  refreshToken: "refresh-token-xyz",
  accountName: "accounts/123456",
  locationName: LOCATION_NAME,
  businessName: "Acme Coffee Shop",
});

const adapter = new GoogleBusinessAdapter();

// ── publish: text post ────────────────────────────────────────────────────────

describe("GoogleBusinessAdapter.publish", () => {
  test("text post (NONE) — returns platformPostId and publishedUrl", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        name: LOCAL_POST_NAME,
        state: "LIVE",
        searchUrl: "https://maps.google.com/?cid=123",
      })
    );

    const result = await adapter.publish(
      {
        content: "Hello from PostFlow! We have a special offer today.",
        mediaType: MediaType.NONE,
        mediaUrls: [],
      },
      TOKEN
    );

    expect(result.platformPostId).toBe(LOCAL_POST_NAME);
    expect(result.publishedUrl).toBe("https://maps.google.com/?cid=123");

    // Verify correct URL and auth header
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`${LOCATION_NAME}/localPosts`);
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${ACCESS_TOKEN}`
    );

    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.topicType).toBe("STANDARD");
    expect(body.summary).toBe(
      "Hello from PostFlow! We have a special offer today."
    );
    expect(body.media).toBeUndefined();
  });

  test("image post (IMAGE) — includes media array with photo URL", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ name: LOCAL_POST_NAME, state: "LIVE" })
    );

    await adapter.publish(
      {
        content: "Check out our new menu!",
        mediaType: MediaType.IMAGE,
        mediaUrls: ["https://example.com/photo.jpg"],
      },
      TOKEN
    );

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    const media = body.media as Array<Record<string, string>>;
    expect(media).toHaveLength(1);
    expect(media[0].mediaFormat).toBe("PHOTO");
    expect(media[0].sourceUrl).toBe("https://example.com/photo.jpg");
  });

  test("uses only first image URL when multiple provided", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ name: LOCAL_POST_NAME, state: "LIVE" })
    );

    await adapter.publish(
      {
        content: "Promo",
        mediaType: MediaType.IMAGE,
        mediaUrls: [
          "https://example.com/img1.jpg",
          "https://example.com/img2.jpg",
        ],
      },
      TOKEN
    );

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    const media = body.media as Array<Record<string, string>>;
    expect(media).toHaveLength(1);
    expect(media[0].sourceUrl).toBe("https://example.com/img1.jpg");
  });

  test("truncates content to 1500 chars", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ name: LOCAL_POST_NAME, state: "LIVE" })
    );

    const longContent = "A".repeat(2000);
    await adapter.publish(
      { content: longContent, mediaType: MediaType.NONE, mediaUrls: [] },
      TOKEN
    );

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect((body.summary as string).length).toBe(1500);
  });

  test("VIDEO throws unsupported error", async () => {
    await expect(
      adapter.publish(
        {
          content: "Video post",
          mediaType: MediaType.VIDEO,
          mediaUrls: ["https://example.com/video.mp4"],
        },
        TOKEN
      )
    ).rejects.toThrow(/VIDEO/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("CAROUSEL throws unsupported error", async () => {
    await expect(
      adapter.publish(
        {
          content: "Carousel post",
          mediaType: MediaType.CAROUSEL,
          mediaUrls: [],
        },
        TOKEN
      )
    ).rejects.toThrow(/CAROUSEL/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("API error — throws with status code", async () => {
    mockFetch.mockResolvedValueOnce(
      fail({ error: { code: 403, message: "Permission denied" } }, 403)
    );

    await expect(
      adapter.publish(
        { content: "Test post", mediaType: MediaType.NONE, mediaUrls: [] },
        TOKEN
      )
    ).rejects.toThrow(/403/);
  });
});

// ── getStatus ─────────────────────────────────────────────────────────────────

describe("GoogleBusinessAdapter.getStatus", () => {
  test("LIVE state → PUBLISHED", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ name: LOCAL_POST_NAME, state: "LIVE" })
    );

    const status = await adapter.getStatus(LOCAL_POST_NAME, TOKEN);
    expect(status).toBe("PUBLISHED");
  });

  test("REJECTED state → FAILED", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ name: LOCAL_POST_NAME, state: "REJECTED" })
    );

    const status = await adapter.getStatus(LOCAL_POST_NAME, TOKEN);
    expect(status).toBe("FAILED");
  });

  test("unknown state → PUBLISHED", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ name: LOCAL_POST_NAME, state: "PROCESSING" })
    );

    const status = await adapter.getStatus(LOCAL_POST_NAME, TOKEN);
    expect(status).toBe("PUBLISHED");
  });

  test("fetch error → FAILED", async () => {
    mockFetch.mockResolvedValueOnce(fail({ error: { message: "Not found" } }, 404));

    const status = await adapter.getStatus(LOCAL_POST_NAME, TOKEN);
    expect(status).toBe("FAILED");
  });
});

// ── deletePost ────────────────────────────────────────────────────────────────

describe("GoogleBusinessAdapter.deletePost", () => {
  test("204 No Content — resolves without error", async () => {
    mockFetch.mockResolvedValueOnce(noContent());

    await expect(adapter.deletePost(LOCAL_POST_NAME, TOKEN)).resolves.toBeUndefined();

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(LOCAL_POST_NAME);
    expect(opts.method).toBe("DELETE");
  });

  test("404 Not Found — ignored (idempotent delete)", async () => {
    mockFetch.mockResolvedValueOnce(fail({ error: { message: "Not found" } }, 404));

    await expect(adapter.deletePost(LOCAL_POST_NAME, TOKEN)).resolves.toBeUndefined();
  });

  test("500 error — throws", async () => {
    mockFetch.mockResolvedValueOnce(
      fail({ error: { message: "Internal Server Error" } }, 500)
    );

    await expect(adapter.deletePost(LOCAL_POST_NAME, TOKEN)).rejects.toThrow(
      /500/
    );
  });
});

// ── getInsights ───────────────────────────────────────────────────────────────

describe("GoogleBusinessAdapter.getInsights", () => {
  test("returns zero metrics (GBP API does not expose engagement metrics)", async () => {
    const insights = await adapter.getInsights(LOCAL_POST_NAME, TOKEN);

    expect(insights.impressions).toBe(0);
    expect(insights.reach).toBe(0);
    expect(insights.likes).toBe(0);
    expect(insights.comments).toBe(0);
    expect(insights.shares).toBe(0);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
