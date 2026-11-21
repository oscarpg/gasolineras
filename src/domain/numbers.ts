/**
 * Parses a number written with a Spanish decimal comma ("1,459") or a dot.
 * Returns `null` for empty or non-numeric input.
 */
export function parseSpanishNumber(value: unknown): number | null {
  const n = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
