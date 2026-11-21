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

/**
 * Parses the dates MITECO uses: "dd-mm-yyyy" or "dd/mm/yyyy", optionally followed
 * by a time ("21/11/2026 9:05:12"). Returns a local-midnight Date, or null.
 */
export function parseMitecoDate(text: string): Date | null {
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(text.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(year, month - 1, day);
  return date.getDate() === day && date.getMonth() === month - 1 ? date : null;
}
