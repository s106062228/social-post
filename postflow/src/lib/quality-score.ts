export interface QualitySignals {
  readabilityScore: number;
  seoScore: number;
  sentimentScore: number | null;
  complianceScore: number | null;
}

export interface QualityScore {
  score: number;
  label: "Excellent" | "Good" | "Fair" | "Needs Work";
  breakdown: {
    readability: number;
    seo: number;
    sentiment: number | null;
    compliance: number | null;
  };
}

const WEIGHTS = {
  readabilityScore: 25,
  seoScore: 35,
  sentimentScore: 15,
  complianceScore: 25,
} as const;

export function computeQualityScore(signals: QualitySignals): QualityScore {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const val = signals[key as keyof QualitySignals];
    if (val !== null && val !== undefined) {
      totalWeight += weight;
      weightedSum += val * weight;
    }
  }

  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return {
    score,
    label: qualityLabel(score),
    breakdown: {
      readability: signals.readabilityScore,
      seo: signals.seoScore,
      sentiment: signals.sentimentScore,
      compliance: signals.complianceScore,
    },
  };
}

export function qualityLabel(
  score: number
): "Excellent" | "Good" | "Fair" | "Needs Work" {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs Work";
}

export function sentimentToScore(
  sentiment: string | null
): number | null {
  if (sentiment === "POSITIVE") return 100;
  if (sentiment === "NEUTRAL") return 65;
  if (sentiment === "NEGATIVE") return 30;
  return null;
}
