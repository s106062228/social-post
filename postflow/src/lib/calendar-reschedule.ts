const DRAGGABLE_STATUSES = ["SCHEDULED", "DRAFT"] as const;

export function isPostDraggable(status: string): boolean {
  return (DRAGGABLE_STATUSES as ReadonlyArray<string>).includes(status);
}

export function computeNewScheduledAt(
  originalScheduledAt: string,
  targetYear: number,
  targetMonth: number,
  targetDay: number
): Date {
  const originalDate = new Date(originalScheduledAt);
  return new Date(
    targetYear,
    targetMonth,
    targetDay,
    originalDate.getHours(),
    originalDate.getMinutes(),
    0,
    0
  );
}

export function parseDayDropId(dayId: string): { year: number; month: number; day: number } | null {
  const parts = dayId.split("-");
  if (parts.length < 4 || parts[0] !== "day") return null;
  const year = parseInt(parts[1]);
  const month = parseInt(parts[2]);
  const day = parseInt(parts[3]);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day };
}
