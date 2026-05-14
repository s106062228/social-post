interface BlackoutPeriodLike {
  name: string;
  startDate: Date;
  endDate: Date;
  isRecurring: boolean;
  daysOfWeek: number[];
}

/**
 * Returns the name of the first blackout period that covers the given date,
 * or null if no period covers it.
 *
 * For non-recurring periods: the date must fall within [startDate, endDate].
 * For recurring periods: the day-of-week must be in daysOfWeek (0=Sun…6=Sat).
 */
export function isInBlackout(
  date: Date,
  periods: BlackoutPeriodLike[]
): string | null {
  for (const period of periods) {
    if (period.isRecurring) {
      const dow = date.getDay();
      if (period.daysOfWeek.includes(dow)) {
        return period.name;
      }
    } else {
      if (date >= period.startDate && date <= period.endDate) {
        return period.name;
      }
    }
  }
  return null;
}
