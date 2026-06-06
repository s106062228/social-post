import { extractUrls, checkUrlHealth, checkUrlsHealth, MAX_LINKS_PER_CHECK } from "@/lib/link-health";

function makeFetchMock(): jest.Mock {
  const spy = jest.fn();
  global.fetch = spy as unknown as typeof fetch;
  return spy;
}

function jsonResponse(status: number): Response {
  return { status } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("extractUrls (re-export)", () => {
  it("extracts and dedupes URLs from content", () => {
    const content =
      "First link https://example.com then second https://example.com/path then repeat https://example.com";
    expect(extractUrls(content)).toEqual([
      "https://example.com",
      "https://example.com/path",
    ]);
  });

  it("returns an empty array when there are no URLs", () => {
    expect(extractUrls("Just plain text with no links here")).toEqual([]);
  });
});

describe("checkUrlHealth", () => {
  it("returns healthy for a 2xx response and uses HEAD", async () => {
    const spy = makeFetchMock();
    spy.mockResolvedValueOnce(jsonResponse(200));

    const result = await checkUrlHealth("https://example.com");

    expect(result).toEqual({
      url: "https://example.com",
      statusCode: 200,
      isHealthy: true,
      errorMessage: null,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ method: "HEAD" })
    );
  });

  it("returns unhealthy with an HTTP error message for 4xx responses", async () => {
    const spy = makeFetchMock();
    spy.mockResolvedValueOnce(jsonResponse(404));

    const result = await checkUrlHealth("https://example.com/missing");

    expect(result).toEqual({
      url: "https://example.com/missing",
      statusCode: 404,
      isHealthy: false,
      errorMessage: "HTTP 404",
    });
  });

  it("treats 3xx redirects as healthy", async () => {
    const spy = makeFetchMock();
    spy.mockResolvedValueOnce(jsonResponse(301));

    const result = await checkUrlHealth("https://example.com/redirect");

    expect(result.isHealthy).toBe(true);
    expect(result.statusCode).toBe(301);
    expect(result.errorMessage).toBeNull();
  });

  it("falls back from HEAD to GET when the server returns 405", async () => {
    const spy = makeFetchMock();
    spy.mockResolvedValueOnce(jsonResponse(405));
    spy.mockResolvedValueOnce(jsonResponse(200));

    const result = await checkUrlHealth("https://example.com/no-head");

    expect(result.isHealthy).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "HEAD" }));
    expect(spy.mock.calls[1][1]).toEqual(expect.objectContaining({ method: "GET" }));
  });

  it("falls back from HEAD to GET when the server returns 501", async () => {
    const spy = makeFetchMock();
    spy.mockResolvedValueOnce(jsonResponse(501));
    spy.mockResolvedValueOnce(jsonResponse(200));

    const result = await checkUrlHealth("https://example.com/not-implemented");

    expect(result.isHealthy).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][1]).toEqual(expect.objectContaining({ method: "GET" }));
  });

  it("falls back to GET when the HEAD request throws", async () => {
    const spy = makeFetchMock();
    spy.mockRejectedValueOnce(new Error("HEAD not supported"));
    spy.mockResolvedValueOnce(jsonResponse(200));

    const result = await checkUrlHealth("https://example.com/head-fails");

    expect(result.isHealthy).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("returns 'Request timed out' when the fetch aborts", async () => {
    const spy = makeFetchMock();
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    spy.mockRejectedValue(abortError);

    const result = await checkUrlHealth("https://example.com/slow");

    expect(result).toEqual({
      url: "https://example.com/slow",
      statusCode: null,
      isHealthy: false,
      errorMessage: "Request timed out",
    });
  });

  it("passes through the error message for generic fetch failures", async () => {
    const spy = makeFetchMock();
    spy.mockRejectedValue(new Error("getaddrinfo ENOTFOUND example.invalid"));

    const result = await checkUrlHealth("https://example.invalid");

    expect(result).toEqual({
      url: "https://example.invalid",
      statusCode: null,
      isHealthy: false,
      errorMessage: "getaddrinfo ENOTFOUND example.invalid",
    });
  });

  it("returns 'Invalid URL' for malformed URL strings without calling fetch", async () => {
    const spy = makeFetchMock();

    const result = await checkUrlHealth("not-a-url");

    expect(result).toEqual({
      url: "not-a-url",
      statusCode: null,
      isHealthy: false,
      errorMessage: "Invalid URL",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns 'Unsupported URL scheme' for non-http(s) protocols without calling fetch", async () => {
    const spy = makeFetchMock();

    const result = await checkUrlHealth("ftp://example.com/file.zip");

    expect(result).toEqual({
      url: "ftp://example.com/file.zip",
      statusCode: null,
      isHealthy: false,
      errorMessage: "Unsupported URL scheme",
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("checkUrlsHealth", () => {
  it("checks multiple URLs in parallel and preserves per-URL results", async () => {
    const spy = makeFetchMock();
    spy.mockResolvedValueOnce(jsonResponse(200));
    spy.mockResolvedValueOnce(jsonResponse(404));

    const results = await checkUrlsHealth(["https://good.example.com", "https://bad.example.com"]);

    expect(results).toEqual([
      {
        url: "https://good.example.com",
        statusCode: 200,
        isHealthy: true,
        errorMessage: null,
      },
      {
        url: "https://bad.example.com",
        statusCode: 404,
        isHealthy: false,
        errorMessage: "HTTP 404",
      },
    ]);
  });

  it("truncates the list to MAX_LINKS_PER_CHECK URLs", async () => {
    const spy = makeFetchMock();
    spy.mockResolvedValue(jsonResponse(200));

    const urls = Array.from({ length: MAX_LINKS_PER_CHECK + 5 }, (_, i) => `https://example.com/${i}`);
    const results = await checkUrlsHealth(urls);

    expect(results).toHaveLength(MAX_LINKS_PER_CHECK);
    expect(spy).toHaveBeenCalledTimes(MAX_LINKS_PER_CHECK);
  });
});
