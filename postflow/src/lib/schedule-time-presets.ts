export interface TimePreset {
  id: string;
  name: string;
  hour: number;
  minute: number;
  daysOfWeek: number[];
  timezone: string;
}

/**
 * Finds the next datetime (at least 5 minutes from now) that matches
 * the preset's hour/minute in the given timezone. If daysOfWeek is non-empty,
 * only returns a datetime on one of those weekdays (0=Sun…6=Sat).
 * Searches up to 8 days ahead. Returns null if no slot found.
 */
export function findNextOccurrence(preset: TimePreset): Date | null {
  const now = new Date();
  const minTime = new Date(now.getTime() + 5 * 60 * 1000);

  for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
    const candidate = new Date(minTime);
    candidate.setDate(candidate.getDate() + dayOffset);

    // Build a candidate date at preset hour:minute in the preset timezone
    const tzDate = new Date(
      new Date(
        candidate.toLocaleDateString("en-CA", { timeZone: preset.timezone }) +
          `T${String(preset.hour).padStart(2, "0")}:${String(preset.minute).padStart(2, "0")}:00`
      )
    );

    // Check if this time is in the future
    if (tzDate <= minTime) continue;

    // Check day of week (in the preset's timezone)
    if (preset.daysOfWeek.length > 0) {
      const dow = new Date(
        tzDate.toLocaleString("en-US", { timeZone: preset.timezone })
      ).getDay();
      if (!preset.daysOfWeek.includes(dow)) continue;
    }

    return tzDate;
  }

  return null;
}

/**
 * Formats a preset's time as a human-readable label, e.g. "9:00 AM (Mon, Wed, Fri)"
 */
export function formatPresetLabel(preset: TimePreset): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hour12 = preset.hour % 12 || 12;
  const ampm = preset.hour < 12 ? "AM" : "PM";
  const minuteStr = String(preset.minute).padStart(2, "0");
  const timeStr = `${hour12}:${minuteStr} ${ampm}`;

  if (preset.daysOfWeek.length === 0) {
    return `${timeStr} (any day)`;
  }
  const days = preset.daysOfWeek.map((d) => dayNames[d]).join(", ");
  return `${timeStr} (${days})`;
}

/**
 * Converts a Date to the datetime-local input value format "YYYY-MM-DDTHH:mm"
 */
export function toDatetimeLocal(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}`;
}
