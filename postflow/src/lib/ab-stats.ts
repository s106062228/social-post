export interface EngagementMetrics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
}

export interface ABStatResult {
  rateA: number;
  rateB: number;
  engagementA: number;
  engagementB: number;
  impressionsA: number;
  impressionsB: number;
  zScore: number;
  pValue: number;
  confidenceLevel: number;
  isSignificant: boolean;
  winnerLead: "A" | "B" | "INCONCLUSIVE";
  effect: number;
  hasSufficientData: boolean;
}

// Abramowitz & Stegun approximation for standard normal CDF
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z > 0 ? 1 - prob : prob;
}

function pValueFromZ(z: number): number {
  return 2 * (1 - normalCDF(Math.abs(z)));
}

export function computeABStats(
  metricsA: EngagementMetrics,
  metricsB: EngagementMetrics
): ABStatResult {
  const engA = metricsA.likes + metricsA.comments + metricsA.shares;
  const engB = metricsB.likes + metricsB.comments + metricsB.shares;
  const nA = metricsA.impressions;
  const nB = metricsB.impressions;
  const hasSufficientData = nA >= 100 && nB >= 100;

  if (nA === 0 && nB === 0) {
    return {
      rateA: 0,
      rateB: 0,
      engagementA: engA,
      engagementB: engB,
      impressionsA: nA,
      impressionsB: nB,
      zScore: 0,
      pValue: 1,
      confidenceLevel: 0,
      isSignificant: false,
      winnerLead: "INCONCLUSIVE",
      effect: 0,
      hasSufficientData: false,
    };
  }

  const rateA = nA > 0 ? engA / nA : 0;
  const rateB = nB > 0 ? engB / nB : 0;

  let zScore = 0;
  let pValue = 1;

  if (nA > 0 && nB > 0) {
    const pooledP = (engA + engB) / (nA + nB);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / nA + 1 / nB));
    if (se > 0) {
      zScore = (rateA - rateB) / se;
      pValue = pValueFromZ(zScore);
    }
  }

  let confidenceLevel = 0;
  if (Math.abs(zScore) >= 2.576) confidenceLevel = 99;
  else if (Math.abs(zScore) >= 1.96) confidenceLevel = 95;
  else if (Math.abs(zScore) >= 1.645) confidenceLevel = 90;

  const isSignificant = confidenceLevel >= 95;

  let winnerLead: "A" | "B" | "INCONCLUSIVE" = "INCONCLUSIVE";
  if (rateA > rateB) winnerLead = "A";
  else if (rateB > rateA) winnerLead = "B";

  const minRate = Math.min(rateA, rateB);
  const maxRate = Math.max(rateA, rateB);
  const effect = minRate > 0 ? ((maxRate - minRate) / minRate) * 100 : 0;

  return {
    rateA,
    rateB,
    engagementA: engA,
    engagementB: engB,
    impressionsA: nA,
    impressionsB: nB,
    zScore,
    pValue,
    confidenceLevel,
    isSignificant,
    winnerLead,
    effect,
    hasSufficientData,
  };
}
