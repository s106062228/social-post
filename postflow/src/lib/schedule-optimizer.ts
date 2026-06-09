import type { PostData, CorrelationResult } from "@/lib/correlation";
import { analyzePostCorrelations } from "@/lib/correlation";

export interface ScheduledPostInput {
  id: string;
  scheduledAt: Date;
  content: string;
  mediaType: string;
  contentCategory: string | null;
}

export interface OptimizationProposal {
  postId: string;
  currentScheduledAt: Date;
  proposedScheduledAt: Date;
  reason: string;
  improvementFactor: number;
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

export function parseDayName(name: string): number {
  return DAY_NAMES.indexOf(name);
}

export function parseHourLabel(label: string): number {
  // "12am"→0, "1am"→1…"11am"→11, "12pm"→12, "1pm"→13…"11pm"→23
  const amMatch = /^(\d+)am$/.exec(label);
  if (amMatch) {
    const h = parseInt(amMatch[1], 10);
    return h === 12 ? 0 : h;
  }
  const pmMatch = /^(\d+)pm$/.exec(label);
  if (pmMatch) {
    const h = parseInt(pmMatch[1], 10);
    return h === 12 ? 12 : h + 12;
  }
  return -1;
}

function nextOccurrenceUTC(
  targetDay: number,
  targetHour: number,
  after: Date,
  withinDays: number
): Date | null {
  for (let d = 0; d < withinDays; d++) {
    const candidate = new Date(after.getTime() + d * 86_400_000);
    if (candidate.getUTCDay() !== targetDay) continue;
    const result = new Date(candidate);
    result.setUTCHours(targetHour, 0, 0, 0);
    if (result > after) return result;
  }
  return null;
}

function buildReasonAndFactor(
  isOptimalDay: boolean,
  isOptimalHour: boolean,
  dayCorr: CorrelationResult | undefined,
  hourCorr: CorrelationResult | undefined
): { reason: string; factor: number } {
  const reasons: string[] = [];
  let factor = 1.0;

  if (!isOptimalDay && dayCorr) {
    const m = Math.round(dayCorr.multiplier * 10) / 10;
    reasons.push(`${dayCorr.bestValue}s drive ${m}× more engagement`);
    factor = Math.max(factor, dayCorr.multiplier);
  }
  if (!isOptimalHour && hourCorr) {
    const m = Math.round(hourCorr.multiplier * 10) / 10;
    reasons.push(`${hourCorr.bestValue} slots drive ${m}× more engagement`);
    factor = Math.max(factor, hourCorr.multiplier);
  }

  return { reason: reasons.join("; "), factor };
}

/**
 * Suggests new schedule times for SCHEDULED posts based on historical
 * correlation data. Returns proposals sorted by improvement factor descending.
 * Requires ≥5 historical posts and at least one correlation insight to work.
 */
export function optimizeSchedule(
  scheduledPosts: ScheduledPostInput[],
  historicalPosts: PostData[],
  options: { windowDays?: number; minGapMs?: number } = {}
): OptimizationProposal[] {
  const windowDays = options.windowDays ?? 30;
  const minGapMs = options.minGapMs ?? 30 * 60_000; // 30 min default

  if (scheduledPosts.length === 0 || historicalPosts.length < 5) return [];

  const correlations = analyzePostCorrelations(historicalPosts);
  if (correlations.length === 0) return [];

  const dayCorr = correlations.find((c) => c.dimension === "day_of_week");
  const hourCorr = correlations.find((c) => c.dimension === "hour_of_day");

  if (!dayCorr && !hourCorr) return [];

  const bestDay = dayCorr ? parseDayName(dayCorr.bestValue) : -1;
  const bestHour = hourCorr ? parseHourLabel(hourCorr.bestValue) : -1;

  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * 86_400_000);

  // Track occupied timestamps to avoid conflicts
  const occupiedMs = new Set<number>(
    scheduledPosts.map((p) => p.scheduledAt.getTime())
  );

  const proposals: OptimizationProposal[] = [];

  for (const post of scheduledPosts) {
    const current = post.scheduledAt;
    if (current < now || current > horizon) continue;

    const currentDay = current.getUTCDay();
    const currentHour = current.getUTCHours();

    const isOptimalDay = bestDay < 0 || currentDay === bestDay;
    const isOptimalHour = bestHour < 0 || currentHour === bestHour;

    if (isOptimalDay && isOptimalHour) continue;

    const { reason, factor } = buildReasonAndFactor(
      isOptimalDay,
      isOptimalHour,
      dayCorr,
      hourCorr
    );

    if (factor < 1.2) continue; // not significant

    const targetDay = bestDay >= 0 ? bestDay : currentDay;
    const targetHour = bestHour >= 0 ? bestHour : currentHour;

    const proposed = nextOccurrenceUTC(targetDay, targetHour, now, windowDays);
    if (!proposed) continue;
    if (proposed.getTime() === current.getTime()) continue;

    // Check conflicts against all occupied slots (excluding this post's current slot)
    let conflicted = false;
    for (const t of occupiedMs) {
      if (t !== current.getTime() && Math.abs(t - proposed.getTime()) < minGapMs) {
        conflicted = true;
        break;
      }
    }
    if (conflicted) continue;

    proposals.push({
      postId: post.id,
      currentScheduledAt: current,
      proposedScheduledAt: proposed,
      reason,
      improvementFactor: Math.round(factor * 100) / 100,
    });

    // Move the occupied slot from old to new time
    occupiedMs.delete(current.getTime());
    occupiedMs.add(proposed.getTime());
  }

  return proposals.sort((a, b) => b.improvementFactor - a.improvementFactor);
}
