export type CorrelationDimension =
  | "day_of_week"
  | "hour_of_day"
  | "content_length"
  | "hashtag_count"
  | "media_type"
  | "content_category";

export interface CorrelationResult {
  dimension: CorrelationDimension;
  dimensionLabel: string;
  bestValue: string;
  bestAvgEngagement: number;
  overallAvgEngagement: number;
  /** bestAvgEngagement / overallAvgEngagement, rounded to 2 dp */
  multiplier: number;
  /** Number of posts in the best-performing bucket */
  sampleSize: number;
  insight: string;
}

export interface PostData {
  content: string;
  mediaType: string;
  contentCategory: string | null;
  publishedAt: Date;
  totalEngagement: number;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hashtagCount(text: string): number {
  return (text.match(/#\w+/g) ?? []).length;
}

function contentLengthBucket(wc: number): string {
  if (wc < 50) return "<50 words";
  if (wc < 100) return "50–100 words";
  if (wc < 200) return "100–200 words";
  return "200+ words";
}

function hashtagBucket(count: number): string {
  if (count === 0) return "No hashtags";
  if (count <= 3) return "1–3 hashtags";
  if (count <= 7) return "4–7 hashtags";
  return "8+ hashtags";
}

function mediaTypeLabel(mediaType: string): string {
  switch (mediaType) {
    case "IMAGE":
      return "Image posts";
    case "VIDEO":
      return "Video posts";
    case "CAROUSEL":
      return "Carousel posts";
    default:
      return "Text-only posts";
  }
}

function computeBucketStats(
  posts: PostData[],
  getBucket: (p: PostData) => string
): Map<string, { total: number; count: number }> {
  const map = new Map<string, { total: number; count: number }>();
  for (const post of posts) {
    const bucket = getBucket(post);
    const existing = map.get(bucket) ?? { total: 0, count: 0 };
    existing.total += post.totalEngagement;
    existing.count += 1;
    map.set(bucket, existing);
  }
  return map;
}

function buildResult(
  dimension: CorrelationDimension,
  dimensionLabel: string,
  overallAvg: number,
  buckets: Map<string, { total: number; count: number }>,
  insightTemplate: (bestValue: string, multiplierStr: string) => string,
  minBucketSize = 3
): CorrelationResult | null {
  let bestValue = "";
  let bestAvg = 0;
  let bestCount = 0;

  for (const [value, stats] of buckets.entries()) {
    if (stats.count < minBucketSize) continue;
    const avg = stats.total / stats.count;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestValue = value;
      bestCount = stats.count;
    }
  }

  if (bestValue === "" || overallAvg === 0) return null;

  const multiplier = Math.round((bestAvg / overallAvg) * 100) / 100;
  if (multiplier < 1.2) return null; // not insightful enough

  const multiplierStr = `${Math.round(multiplier * 10) / 10}×`;

  return {
    dimension,
    dimensionLabel,
    bestValue,
    bestAvgEngagement: Math.round(bestAvg * 10) / 10,
    overallAvgEngagement: Math.round(overallAvg * 10) / 10,
    multiplier,
    sampleSize: bestCount,
    insight: insightTemplate(bestValue, multiplierStr),
  };
}

/**
 * Analyse relationships between post attributes and engagement.
 * Returns up to 5 insights sorted by multiplier (strongest first).
 * Requires at least 5 posts; returns [] with insufficient data.
 */
export function analyzePostCorrelations(posts: PostData[]): CorrelationResult[] {
  if (posts.length < 5) return [];

  const overallAvg =
    posts.reduce((sum, p) => sum + p.totalEngagement, 0) / posts.length;

  const results: CorrelationResult[] = [];

  // 1. Day of week
  const dayBuckets = computeBucketStats(posts, (p) =>
    DAY_NAMES[p.publishedAt.getUTCDay()]
  );
  const dayResult = buildResult(
    "day_of_week",
    "Day of Week",
    overallAvg,
    dayBuckets,
    (v, m) => `${v} posts get ${m} more engagement`
  );
  if (dayResult) results.push(dayResult);

  // 2. Hour of day
  const hourBuckets = computeBucketStats(posts, (p) =>
    formatHour(p.publishedAt.getUTCHours())
  );
  const hourResult = buildResult(
    "hour_of_day",
    "Hour of Day",
    overallAvg,
    hourBuckets,
    (v, m) => `Posts at ${v} get ${m} more engagement`
  );
  if (hourResult) results.push(hourResult);

  // 3. Content length
  const lengthBuckets = computeBucketStats(posts, (p) =>
    contentLengthBucket(wordCount(p.content))
  );
  const lengthResult = buildResult(
    "content_length",
    "Content Length",
    overallAvg,
    lengthBuckets,
    (v, m) => `${v} get ${m} more engagement`
  );
  if (lengthResult) results.push(lengthResult);

  // 4. Hashtag count
  const tagBuckets = computeBucketStats(posts, (p) =>
    hashtagBucket(hashtagCount(p.content))
  );
  const tagResult = buildResult(
    "hashtag_count",
    "Hashtag Count",
    overallAvg,
    tagBuckets,
    (v, m) => `Posts with ${v} get ${m} more engagement`
  );
  if (tagResult) results.push(tagResult);

  // 5. Media type
  const mediaBuckets = computeBucketStats(posts, (p) =>
    mediaTypeLabel(p.mediaType)
  );
  const mediaResult = buildResult(
    "media_type",
    "Media Type",
    overallAvg,
    mediaBuckets,
    (v, m) => `${v} get ${m} more engagement`
  );
  if (mediaResult) results.push(mediaResult);

  // 6. Content category (only when ≥2 distinct non-null categories)
  const categories = new Set(
    posts.map((p) => p.contentCategory ?? "Uncategorized")
  );
  if (categories.size >= 2) {
    const catBuckets = computeBucketStats(
      posts,
      (p) => p.contentCategory ?? "Uncategorized"
    );
    const catResult = buildResult(
      "content_category",
      "Content Category",
      overallAvg,
      catBuckets,
      (v, m) => `${v} posts get ${m} more engagement`
    );
    if (catResult) results.push(catResult);
  }

  return results
    .sort((a, b) => b.multiplier - a.multiplier)
    .slice(0, 5);
}
