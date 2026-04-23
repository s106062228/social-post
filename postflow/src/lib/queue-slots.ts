import { prisma } from "@/lib/db";
import { PostStatus } from "@prisma/client";

// ── Timezone helpers ──────────────────────────────────────────────────────────

function getUTCOffsetMinutes(tz: string, ref: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(ref);
    const offsetStr = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    // e.g. "GMT+8", "GMT-5:30", "GMT"
    const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!match) return 0;
    const sign = match[1] === "+" ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = parseInt(match[3] ?? "0", 10);
    return sign * (hours * 60 + minutes);
  } catch {
    return 0;
  }
}

function getLocalDayOfWeek(date: Date, tz: string): number {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  try {
    const str = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    }).format(date);
    const idx = dayNames.indexOf(str);
    return idx >= 0 ? idx : 0;
  } catch {
    return date.getDay();
  }
}

function getLocalDateStr(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date); // YYYY-MM-DD
  } catch {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

function slotToUtc(baseDate: Date, hour: number, minute: number, tz: string): Date {
  const dateStr = getLocalDateStr(baseDate, tz);
  const h = String(hour).padStart(2, "0");
  const m = String(minute).padStart(2, "0");
  // Create naive UTC date representing local time components
  const naive = new Date(`${dateStr}T${h}:${m}:00.000Z`);
  const offsetMins = getUTCOffsetMinutes(tz, naive);
  return new Date(naive.getTime() - offsetMins * 60_000);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Finds the next unoccupied posting queue slot for a user within 30 days.
 * Returns null if no active slots exist or all slots are occupied.
 */
export async function findNextAvailableSlot(
  userId: string,
  timezone: string = "UTC"
): Promise<Date | null> {
  const slots = await prisma.postQueueSlot.findMany({
    where: { userId, isActive: true },
    orderBy: [{ hour: "asc" }, { minute: "asc" }],
  });

  if (slots.length === 0) return null;

  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60_000);

  // Collect occupied times (±15 min buffer) from existing scheduled posts
  const existingPosts = await prisma.post.findMany({
    where: {
      userId,
      status: { in: [PostStatus.SCHEDULED, PostStatus.PUBLISHING] },
      scheduledAt: { gte: now, lte: horizon },
    },
    select: { scheduledAt: true },
  });

  const occupiedMs = existingPosts
    .map((p) => p.scheduledAt!.getTime())
    .filter(Boolean);

  const BUFFER_MS = 15 * 60_000;

  function isOccupied(candidate: Date): boolean {
    return occupiedMs.some(
      (t) => Math.abs(t - candidate.getTime()) < BUFFER_MS
    );
  }

  // Walk forward up to 30 days, checking each slot on each day
  for (let d = 0; d < 30; d++) {
    const dayRef = new Date(now.getTime() + d * 24 * 60 * 60_000);
    const dayOfWeek = getLocalDayOfWeek(dayRef, timezone);

    for (const slot of slots) {
      // Skip if slot doesn't apply to this day
      if (slot.daysOfWeek.length > 0 && !slot.daysOfWeek.includes(dayOfWeek)) {
        continue;
      }

      const candidate = slotToUtc(dayRef, slot.hour, slot.minute, timezone);

      // Must be in the future
      if (candidate <= now) continue;

      if (!isOccupied(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Returns a preview of the next N upcoming slot datetimes (ignoring occupancy).
 * Used to display upcoming queue windows on the settings page.
 */
export function previewUpcomingSlots(
  slots: Array<{ hour: number; minute: number; daysOfWeek: number[]; isActive: boolean }>,
  timezone: string = "UTC",
  count: number = 7
): Date[] {
  const active = slots.filter((s) => s.isActive);
  if (active.length === 0) return [];

  const now = new Date();
  const results: Date[] = [];

  for (let d = 0; d < 60 && results.length < count; d++) {
    const dayRef = new Date(now.getTime() + d * 24 * 60 * 60_000);
    const dayOfWeek = getLocalDayOfWeek(dayRef, timezone);

    for (const slot of active) {
      if (slot.daysOfWeek.length > 0 && !slot.daysOfWeek.includes(dayOfWeek)) {
        continue;
      }

      const candidate = slotToUtc(dayRef, slot.hour, slot.minute, timezone);
      if (candidate <= now) continue;

      results.push(candidate);
      if (results.length >= count) break;
    }
  }

  return results;
}
