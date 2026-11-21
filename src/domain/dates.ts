/** Formats a date as MITECO expects it in URLs and bulletins: dd-mm-yyyy (local time). */
export function toMitecoDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}-${m}-${date.getFullYear()}`;
}

/** Returns a new Date `days` days before `date` (same time of day). */
export function daysBefore(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(date.getDate() - days);
  return result;
}
