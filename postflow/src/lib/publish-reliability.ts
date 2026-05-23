export interface PlatformReliabilityData {
  platform: string;
  successRate: number;
  totalAttempts: number;
  successCount: number;
  failedCount: number;
  avgRetryCount: number;
  commonErrors: string[];
  avgPublishLatencyMs: number | null;
}

export interface PublishResultForReliability {
  platform: string;
  status: string;
  error: string | null;
  publishedAt: Date | null;
  retryCount: number;
  post: { scheduledAt: Date | null } | null;
}

export function computePlatformReliability(
  results: PublishResultForReliability[]
): PlatformReliabilityData[] {
  const platformMap = new Map<string, PublishResultForReliability[]>();
  for (const r of results) {
    const arr = platformMap.get(r.platform) ?? [];
    arr.push(r);
    platformMap.set(r.platform, arr);
  }

  const output: PlatformReliabilityData[] = [];

  for (const [platform, platformResults] of platformMap.entries()) {
    const successCount = platformResults.filter((r) => r.status === "PUBLISHED").length;
    const failedCount = platformResults.filter((r) => r.status === "FAILED").length;
    const totalAttempts = platformResults.length;
    const successRate =
      totalAttempts > 0 ? Math.round((successCount / totalAttempts) * 100) : 0;

    const totalRetries = platformResults.reduce((sum, r) => sum + r.retryCount, 0);
    const avgRetryCount =
      totalAttempts > 0
        ? Math.round((totalRetries / totalAttempts) * 10) / 10
        : 0;

    const errorFreq = new Map<string, number>();
    for (const r of platformResults) {
      if (r.error && r.status === "FAILED") {
        const key = r.error.slice(0, 100);
        errorFreq.set(key, (errorFreq.get(key) ?? 0) + 1);
      }
    }
    const commonErrors = Array.from(errorFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([msg]) => msg);

    const latencies: number[] = [];
    for (const r of platformResults) {
      if (r.status === "PUBLISHED" && r.publishedAt && r.post?.scheduledAt) {
        const latencyMs =
          r.publishedAt.getTime() - r.post.scheduledAt.getTime();
        if (latencyMs >= 0) latencies.push(latencyMs);
      }
    }
    const avgPublishLatencyMs =
      latencies.length > 0
        ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
        : null;

    output.push({
      platform,
      successRate,
      totalAttempts,
      successCount,
      failedCount,
      avgRetryCount,
      commonErrors,
      avgPublishLatencyMs,
    });
  }

  output.sort((a, b) => b.totalAttempts - a.totalAttempts);
  return output;
}
