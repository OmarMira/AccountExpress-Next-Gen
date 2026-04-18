/**
 * Returns the number of days between two ISO date strings (YYYY-MM-DD).
 * Positive if dateA is after dateB, negative otherwise.
 */
export function daysDiff(dateA: string, dateB: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round((a - b) / msPerDay);
}
