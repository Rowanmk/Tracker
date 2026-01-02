// src/utils/rollingWindow.ts
export function getLast12CompletedMonthsWindow() {
  // End = last day of previous month
  const end = new Date();
  end.setDate(0);
  end.setHours(23, 59, 59, 999);

  // Start = first day of the month, 11 months before end (12 full months total)
  const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

export function monthYearPairsBetween(start: Date, end: Date) {
  const pairs: Array<{ month: number; year: number }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor <= end) {
    pairs.push({ month: cursor.getMonth() + 1, year: cursor.getFullYear() });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return pairs;
}
