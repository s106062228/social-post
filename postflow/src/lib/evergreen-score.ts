export interface EvergreenInsights {
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  reach?: number | null;
  impressions?: number | null;
}

export interface EvergreenPostInput {
  id: string;
  content: string;
  publishedAt?: Date | null;
  createdAt: Date;
  isEvergreen: boolean;
  insights: EvergreenInsights;
}

export interface EvergreenCandidate {
  postId: string;
  content: string;
  score: number;
  label: "Excellent" | "Good" | "Fair" | "Poor";
  ageInDays: number;
  engagementScore: number;
  timelessnessScore: number;
  hashtagScore: number;
  likes: number;
  comments: number;
  shares: number;
  isEvergreen: boolean;
}

/** Keywords that indicate time-sensitive content (lower timelessness score). */
const TIME_SENSITIVE_KEYWORDS = [
  "breaking",
  "just announced",
  "today",
  "yesterday",
  "this week",
  "this month",
  "this year",
  "2024",
  "2025",
  "2026",
  "2027",
  "trending",
  "happening now",
  "live",
  "urgent",
  "deadline",
  "expires",
  "limited time",
  "flash sale",
  "last chance",
  "news",
  "update",
  "alert",
  "announcement",
  "just dropped",
  "new release",
  "just launched",
];

/**
 * Compute a 0-100 evergreen suitability score for a published post.
 *
 * Weights:
 *  - Engagement rate score (40 pts max): engagement / max(reach, 1)
 *  - Age-with-engagement score (20 pts max): older posts with good engagement
 *    signal staying power
 *  - Timelessness score (30 pts max): absence of time-sensitive language
 *  - Hashtag diversity score (10 pts max): moderate hashtag count is good
 */
export function computeEvergreenScore(
  post: EvergreenPostInput,
  avgEngagementScore: number = 0
): EvergreenCandidate {
  const likes = post.insights.likes ?? 0;
  const comments = post.insights.comments ?? 0;
  const shares = post.insights.shares ?? 0;
  const reach = post.insights.reach ?? 0;
  const impressions = post.insights.impressions ?? 0;

  const effectiveReach = Math.max(reach, impressions, 1);
  const rawEngagement = likes * 3 + comments * 5 + shares * 4;
  const engagementRate = rawEngagement / effectiveReach;

  // ── Engagement score (40 pts) ──────────────────────────────────────────────
  // Normalise: >= 0.5 rate gets full 40 pts; 0 gets 0
  const engagementScore = Math.min(40, (engagementRate / 0.5) * 40);

  // ── Age score (20 pts) ─────────────────────────────────────────────────────
  const now = new Date();
  const referenceDate = post.publishedAt ?? post.createdAt;
  const ageInDays = Math.max(
    0,
    (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  // Posts aged 30–180 days with decent engagement score the highest
  const ageBonus = ageInDays >= 30 ? Math.min(1, (ageInDays - 30) / 150) : ageInDays / 30;
  // Apply age bonus only when there is some engagement
  const ageScore = rawEngagement > 0 ? ageBonus * 20 : 0;

  // ── Timelessness score (30 pts) ────────────────────────────────────────────
  const lowerContent = post.content.toLowerCase();
  let timeSensitiveHits = 0;
  for (const kw of TIME_SENSITIVE_KEYWORDS) {
    if (lowerContent.includes(kw)) {
      timeSensitiveHits++;
    }
  }
  const timelessnessScore = Math.max(0, 30 - timeSensitiveHits * 10);

  // ── Hashtag diversity score (10 pts) ──────────────────────────────────────
  const hashtagMatches = post.content.match(/#\w+/g) ?? [];
  const hashtagCount = hashtagMatches.length;
  // 3-10 hashtags is considered optimal for evergreen
  let hashtagScore: number;
  if (hashtagCount >= 3 && hashtagCount <= 10) {
    hashtagScore = 10;
  } else if (hashtagCount === 0) {
    hashtagScore = 3; // no hashtags = discoverable but less so
  } else if (hashtagCount < 3) {
    hashtagScore = 6;
  } else {
    // Too many hashtags can appear spammy
    hashtagScore = Math.max(0, 10 - (hashtagCount - 10) * 2);
  }

  const totalScore = Math.round(
    Math.min(100, engagementScore + ageScore + timelessnessScore + hashtagScore)
  );

  return {
    postId: post.id,
    content: post.content,
    score: totalScore,
    label: evergreenLabel(totalScore),
    ageInDays: Math.round(ageInDays),
    engagementScore: Math.round(engagementScore),
    timelessnessScore: Math.round(timelessnessScore),
    hashtagScore: Math.round(hashtagScore),
    likes,
    comments,
    shares,
    isEvergreen: post.isEvergreen,
  };
}

export function evergreenLabel(
  score: number
): "Excellent" | "Good" | "Fair" | "Poor" {
  if (score >= 70) return "Excellent";
  if (score >= 50) return "Good";
  if (score >= 30) return "Fair";
  return "Poor";
}
