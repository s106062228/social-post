export interface PromotionMetrics {
  spend: number;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}

export interface PromotionRoiMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpm: number | null;
  cpc: number | null;
  cpa: number | null;
  ctr: number | null;
  conversionRate: number | null;
}

export function computeRoiMetrics(p: PromotionMetrics): PromotionRoiMetrics {
  const impressions = p.impressions ?? 0;
  const clicks = p.clicks ?? 0;
  const conversions = p.conversions ?? 0;

  return {
    spend: p.spend,
    impressions,
    clicks,
    conversions,
    cpm: impressions > 0 ? (p.spend / impressions) * 1000 : null,
    cpc: clicks > 0 ? p.spend / clicks : null,
    cpa: conversions > 0 ? p.spend / conversions : null,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    conversionRate: clicks > 0 ? (conversions / clicks) * 100 : null,
  };
}

export interface PlatformPromotionRoi {
  platform: string;
  promotionCount: number;
  totalBudget: number;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  avgCpm: number | null;
  avgCpc: number | null;
  avgCpa: number | null;
  avgCtr: number | null;
  budgetUtilization: number;
}

export function computePlatformPromotionRoi(
  promotions: { platform: string; budget: number; spend: number; impressions: number | null; clicks: number | null; conversions: number | null }[]
): PlatformPromotionRoi[] {
  const groups = new Map<string, typeof promotions>();
  for (const promo of promotions) {
    const list = groups.get(promo.platform) ?? [];
    list.push(promo);
    groups.set(promo.platform, list);
  }

  const result: PlatformPromotionRoi[] = [];
  for (const [platform, list] of groups) {
    const totalBudget = list.reduce((sum, p) => sum + p.budget, 0);
    const totalSpend = list.reduce((sum, p) => sum + p.spend, 0);
    const totalImpressions = list.reduce((sum, p) => sum + (p.impressions ?? 0), 0);
    const totalClicks = list.reduce((sum, p) => sum + (p.clicks ?? 0), 0);
    const totalConversions = list.reduce((sum, p) => sum + (p.conversions ?? 0), 0);

    result.push({
      platform,
      promotionCount: list.length,
      totalBudget,
      totalSpend,
      totalImpressions,
      totalClicks,
      totalConversions,
      avgCpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null,
      avgCpc: totalClicks > 0 ? totalSpend / totalClicks : null,
      avgCpa: totalConversions > 0 ? totalSpend / totalConversions : null,
      avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null,
      budgetUtilization: totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0,
    });
  }

  return result.sort((a, b) => b.totalSpend - a.totalSpend);
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}
