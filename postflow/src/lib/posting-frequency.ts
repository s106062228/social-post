// Recommended posts per week per platform (industry standards)
export const RECOMMENDED_FREQUENCY: Record<string, number> = {
  FACEBOOK: 5,
  INSTAGRAM: 7,
  THREADS: 14,
  TWITTER: 14,
  LINKEDIN: 3,
  TIKTOK: 7,
  YOUTUBE: 2,
  PINTEREST: 5,
  REDDIT: 7,
  BLUESKY: 7,
  MASTODON: 7,
  TELEGRAM: 5,
  TUMBLR: 3,
  WORDPRESS: 3,
  MEDIUM: 2,
  GHOST: 2,
  DEVTO: 3,
  HASHNODE: 2,
  NOSTR: 7,
  PIXELFED: 7,
  VIMEO: 2,
  BEEHIIV: 2,
  GOOGLE_BUSINESS: 3,
};

const DEFAULT_RECOMMENDED = 5;

export interface PlatformFrequencyData {
  platform: string;
  actualPerWeek: number;
  recommendedPerWeek: number;
  pacingScore: number;
  status: "optimal" | "over" | "under";
  totalPublished: number;
}

export interface PublishResultForFrequency {
  platform: string;
}

/**
 * Compute per-platform posting frequency vs recommendations.
 * pacingScore: 100 = exactly on target, drops linearly for over/under-posting.
 */
export function computePlatformFrequency(
  publishResults: PublishResultForFrequency[],
  periodDays: number
): PlatformFrequencyData[] {
  const platformCounts = new Map<string, number>();
  for (const r of publishResults) {
    platformCounts.set(r.platform, (platformCounts.get(r.platform) ?? 0) + 1);
  }

  const weeksInPeriod = periodDays / 7;

  const output: PlatformFrequencyData[] = [];

  for (const [platform, totalPublished] of platformCounts.entries()) {
    const actualPerWeek =
      weeksInPeriod > 0
        ? Math.round((totalPublished / weeksInPeriod) * 10) / 10
        : 0;
    const recommendedPerWeek =
      RECOMMENDED_FREQUENCY[platform] ?? DEFAULT_RECOMMENDED;

    let pacingScore: number;
    let status: "optimal" | "over" | "under";

    if (recommendedPerWeek === 0) {
      pacingScore = 100;
      status = "optimal";
    } else {
      const ratio = actualPerWeek / recommendedPerWeek;

      if (ratio >= 0.8 && ratio <= 1.2) {
        // Within 20% of target = optimal
        pacingScore = 100;
        status = "optimal";
      } else if (ratio > 1.2) {
        // Over-posting: score drops linearly, 0 at 3x recommended
        const overFactor = Math.min(ratio - 1.2, 1.8) / 1.8;
        pacingScore = Math.round(100 - overFactor * 100);
        status = "over";
      } else {
        // Under-posting: score drops linearly, 0 at 0 posts
        const underFactor = 1 - ratio / 0.8;
        pacingScore = Math.round(100 - underFactor * 100);
        status = "under";
      }
    }

    pacingScore = Math.max(0, Math.min(100, pacingScore));

    output.push({
      platform,
      actualPerWeek,
      recommendedPerWeek,
      pacingScore,
      status,
      totalPublished,
    });
  }

  // Sort by totalPublished descending
  output.sort((a, b) => b.totalPublished - a.totalPublished);
  return output;
}
