/**
 * Green (cheapest) → red (most expensive) colour for a value within [min, max].
 * Returns an `hsl()` string. If all values are equal, everything is green.
 */
export function colorForValue(value: number, min: number, max: number): string {
  const ratio = max > min ? (value - min) / (max - min) : 0;
  const hue = Math.round((1 - ratio) * 120);
  return `hsl(${hue}, 82%, 40%)`;
}
