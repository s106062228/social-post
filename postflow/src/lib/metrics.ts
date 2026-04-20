import { Redis } from "ioredis";

const KEY_PREFIX = "pf_metric:";

let redis: Redis | null = null;

export function getMetricsRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL not set");
    redis = new Redis(url, { lazyConnect: true, enableReadyCheck: false });
  }
  return redis;
}

function serializeLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
}

function buildKey(name: string, labels: Record<string, string>): string {
  const labelStr = serializeLabels(labels);
  return labelStr ? `${KEY_PREFIX}${name}:${labelStr}` : `${KEY_PREFIX}${name}`;
}

function parseKey(key: string): { name: string; labelsStr: string } | null {
  const withoutPrefix = key.slice(KEY_PREFIX.length);
  const colonIdx = withoutPrefix.indexOf(":");
  if (colonIdx === -1) return { name: withoutPrefix, labelsStr: "" };
  return {
    name: withoutPrefix.slice(0, colonIdx),
    labelsStr: withoutPrefix.slice(colonIdx + 1),
  };
}

export async function incrementCounter(
  name: string,
  labels: Record<string, string> = {}
): Promise<void> {
  const key = buildKey(name, labels);
  await getMetricsRedis().incr(key);
}

export async function getPrometheusMetrics(): Promise<string> {
  const client = getMetricsRedis();

  const keys: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, found] = await client.scan(
      cursor,
      "MATCH",
      `${KEY_PREFIX}*`,
      "COUNT",
      "100"
    );
    cursor = nextCursor;
    keys.push(...found);
  } while (cursor !== "0");

  if (keys.length === 0) return "# no metrics collected yet\n";

  const values = await client.mget(...keys);

  const grouped = new Map<string, Array<{ labelsStr: string; value: number }>>();
  for (let i = 0; i < keys.length; i++) {
    const parsed = parseKey(keys[i]);
    if (!parsed) continue;
    const value = parseInt(values[i] ?? "0", 10);
    const existing = grouped.get(parsed.name) ?? [];
    existing.push({ labelsStr: parsed.labelsStr, value });
    grouped.set(parsed.name, existing);
  }

  const lines: string[] = [];
  for (const [name, entries] of grouped.entries()) {
    lines.push(`# TYPE ${name} counter`);
    for (const { labelsStr, value } of entries) {
      const labelPart = labelsStr ? `{${labelsStr}}` : "";
      lines.push(`${name}${labelPart} ${value}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export const metrics = {
  publishJobComplete: (platform: string) =>
    incrementCounter("postflow_publish_jobs_total", { platform, status: "success" }),
  publishJobFailed: (platform: string) =>
    incrementCounter("postflow_publish_jobs_total", { platform, status: "failed" }),
  tokenRefreshComplete: () =>
    incrementCounter("postflow_token_refresh_total", { status: "success" }),
  tokenRefreshFailed: () =>
    incrementCounter("postflow_token_refresh_total", { status: "failed" }),
  httpRequest: (method: string, statusCode: number) =>
    incrementCounter("postflow_http_requests_total", {
      method: method.toUpperCase(),
      status: String(statusCode),
    }),
};
