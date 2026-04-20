// Mock variables must be declared before jest.mock() hoisting
const mockIncr = jest.fn<Promise<number>, [string]>();
const mockScan = jest.fn<Promise<[string, string[]]>, unknown[]>();
const mockMget = jest.fn<Promise<(string | null)[]>, string[]>();

jest.mock("ioredis", () => ({
  Redis: jest.fn().mockImplementation(() => ({
    incr: mockIncr,
    scan: mockScan,
    mget: mockMget,
  })),
}));

import { incrementCounter, getPrometheusMetrics, metrics } from "../metrics";

describe("incrementCounter", () => {
  beforeAll(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  beforeEach(() => {
    mockIncr.mockResolvedValue(1);
  });

  it("calls INCR with the prefixed key (no labels)", async () => {
    await incrementCounter("my_counter");
    expect(mockIncr).toHaveBeenCalledWith("pf_metric:my_counter");
  });

  it("builds key with sorted, quoted labels", async () => {
    await incrementCounter("my_counter", { status: "ok", method: "GET" });
    expect(mockIncr).toHaveBeenCalledWith(
      'pf_metric:my_counter:method="GET",status="ok"'
    );
  });

  it("sorts labels alphabetically", async () => {
    await incrementCounter("c", { z: "1", a: "2" });
    expect(mockIncr).toHaveBeenCalledWith('pf_metric:c:a="2",z="1"');
  });
});

describe("getPrometheusMetrics", () => {
  beforeAll(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  it('returns "no metrics" comment when there are no keys', async () => {
    mockScan.mockResolvedValueOnce(["0", []]);
    const output = await getPrometheusMetrics();
    expect(output).toBe("# no metrics collected yet\n");
  });

  it("returns Prometheus text format for a single counter", async () => {
    mockScan.mockResolvedValueOnce([
      "0",
      ['pf_metric:postflow_publish_jobs_total:platform="facebook",status="success"'],
    ]);
    mockMget.mockResolvedValueOnce(["42"]);

    const output = await getPrometheusMetrics();
    expect(output).toContain("# TYPE postflow_publish_jobs_total counter");
    expect(output).toContain(
      'postflow_publish_jobs_total{platform="facebook",status="success"} 42'
    );
  });

  it("groups multiple label combinations under one TYPE header", async () => {
    mockScan.mockResolvedValueOnce([
      "0",
      [
        'pf_metric:postflow_publish_jobs_total:platform="facebook",status="success"',
        'pf_metric:postflow_publish_jobs_total:platform="instagram",status="failed"',
      ],
    ]);
    mockMget.mockResolvedValueOnce(["10", "2"]);

    const output = await getPrometheusMetrics();
    const typeLines = output
      .split("\n")
      .filter((l) => l.startsWith("# TYPE postflow_publish_jobs_total"));
    expect(typeLines).toHaveLength(1);
    expect(output).toContain(
      'postflow_publish_jobs_total{platform="facebook",status="success"} 10'
    );
    expect(output).toContain(
      'postflow_publish_jobs_total{platform="instagram",status="failed"} 2'
    );
  });

  it("handles key with no labels (no colon after name)", async () => {
    mockScan.mockResolvedValueOnce(["0", ["pf_metric:simple_counter"]]);
    mockMget.mockResolvedValueOnce(["7"]);

    const output = await getPrometheusMetrics();
    expect(output).toContain("# TYPE simple_counter counter");
    expect(output).toContain("simple_counter 7");
  });

  it("treats null Redis value as 0", async () => {
    mockScan.mockResolvedValueOnce([
      "0",
      ['pf_metric:some_counter:status="ok"'],
    ]);
    mockMget.mockResolvedValueOnce([null]);

    const output = await getPrometheusMetrics();
    expect(output).toContain('some_counter{status="ok"} 0');
  });

  it("iterates cursor until exhausted", async () => {
    mockScan
      .mockResolvedValueOnce(["42", ['pf_metric:counter_a']])
      .mockResolvedValueOnce(["0", ['pf_metric:counter_b']]);
    mockMget.mockResolvedValueOnce(["1", "2"]);

    const output = await getPrometheusMetrics();
    expect(mockScan).toHaveBeenCalledTimes(2);
    expect(output).toContain("# TYPE counter_a counter");
    expect(output).toContain("# TYPE counter_b counter");
  });
});

describe("metrics helpers", () => {
  beforeEach(() => {
    mockIncr.mockResolvedValue(1);
  });

  it("metrics.publishJobComplete uses correct labels", async () => {
    await metrics.publishJobComplete("facebook");
    expect(mockIncr).toHaveBeenCalledWith(
      'pf_metric:postflow_publish_jobs_total:platform="facebook",status="success"'
    );
  });

  it("metrics.publishJobFailed uses correct labels", async () => {
    await metrics.publishJobFailed("instagram");
    expect(mockIncr).toHaveBeenCalledWith(
      'pf_metric:postflow_publish_jobs_total:platform="instagram",status="failed"'
    );
  });

  it("metrics.tokenRefreshComplete uses correct labels", async () => {
    await metrics.tokenRefreshComplete();
    expect(mockIncr).toHaveBeenCalledWith(
      'pf_metric:postflow_token_refresh_total:status="success"'
    );
  });

  it("metrics.tokenRefreshFailed uses correct labels", async () => {
    await metrics.tokenRefreshFailed();
    expect(mockIncr).toHaveBeenCalledWith(
      'pf_metric:postflow_token_refresh_total:status="failed"'
    );
  });

  it("metrics.httpRequest uppercases method", async () => {
    await metrics.httpRequest("get", 200);
    expect(mockIncr).toHaveBeenCalledWith(
      'pf_metric:postflow_http_requests_total:method="GET",status="200"'
    );
  });
});
