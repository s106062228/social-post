export type ViralStatus = "viral" | "trending" | "normal";

export interface PostVelocityData {
  postId: string;
  content: string;
  publishedAt: Date;
  platform: string;
  totalEngagement: number;
  hoursSincePublished: number;
  velocityPerHour: number;
  viralStatus: ViralStatus;
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    reach: number;
    impressions: number;
  };
}

export interface PostForViral {
  postId: string;
  content: string;
  publishedAt: Date;
  platform: string;
  insights: {
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    reach?: number | null;
    impressions?: number | null;
  };
}

/**
 * Compute weighted engagement velocity (engagement-score per hour since publishing).
 * Returns 0 if post was published in the future or has zero engagement.
 */
export function computeEngagementVelocity(
  totalEngagement: number,
  publishedAt: Date,
  now: Date = new Date()
): number {
  const hoursSincePublished =
    (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
  if (hoursSincePublished <= 0) return 0;
  return totalEngagement / hoursSincePublished;
}

/**
 * Classify a post's viral status based on its velocity relative to the user's average.
 * viral   = velocity >= 3× average
 * trending = velocity >= 1.5× average
 * normal  = below 1.5× average
 */
export function classifyViralStatus(
  velocity: number,
  avgVelocity: number
): ViralStatus {
  if (avgVelocity <= 0) return velocity > 0 ? "trending" : "normal";
  if (velocity >= avgVelocity * 3) return "viral";
  if (velocity >= avgVelocity * 1.5) return "trending";
  return "normal";
}

/**
 * Detect viral / trending posts from a list of published posts with insights.
 * Returns posts sorted by velocityPerHour descending.
 */
export function detectViralPosts(
  posts: PostForViral[],
  now: Date = new Date()
): PostVelocityData[] {
  const withVelocity = posts.map((post) => {
    const likes = post.insights.likes ?? 0;
    const comments = post.insights.comments ?? 0;
    const shares = post.insights.shares ?? 0;
    const reach = post.insights.reach ?? 0;
    const impressions = post.insights.impressions ?? 0;

    const totalEngagement =
      likes * 3 + comments * 5 + shares * 4 + reach + impressions * 0.5;

    const velocity = computeEngagementVelocity(totalEngagement, post.publishedAt, now);
    const hoursSincePublished = Math.max(
      0,
      (now.getTime() - post.publishedAt.getTime()) / (1000 * 60 * 60)
    );

    return {
      postId: post.postId,
      content: post.content,
      publishedAt: post.publishedAt,
      platform: post.platform,
      totalEngagement,
      hoursSincePublished,
      velocityPerHour: velocity,
      viralStatus: "normal" as ViralStatus,
      metrics: { likes, comments, shares, reach, impressions },
    };
  });

  const totalVelocity = withVelocity.reduce(
    (sum, p) => sum + p.velocityPerHour,
    0
  );
  const avgVelocity =
    withVelocity.length > 0 ? totalVelocity / withVelocity.length : 0;

  return withVelocity
    .map((p) => ({
      ...p,
      viralStatus: classifyViralStatus(p.velocityPerHour, avgVelocity),
    }))
    .sort((a, b) => b.velocityPerHour - a.velocityPerHour);
}
