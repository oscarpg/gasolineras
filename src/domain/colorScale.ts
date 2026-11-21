/**
 * Green (cheapest) → red (most expensive) colour for a value within [min, max].
 * Returns an `hsl()` string. If all values are equal, everything is green.
 */
export function colorForValue(value: number, min: number, max: number): string {
  const ratio = max > min ? (value - min) / (max - min) : 0;
  const hue = Math.round((1 - ratio) * 120);
  return `hsl(${hue}, 82%, 40%)`;
}

/** Lightness that gives every hue of the scale at least 4.5:1 contrast on white (WCAG AA for normal text). */
export const TEXT_LIGHTNESS = 26;

/**
 * Darker version of a `colorForValue` colour, for text. Map pins keep the brighter
 * colour (they are shapes, not text); prices written in the colour use this one.
 */
export function textColorFor(color: string): string {
  return color.replace(/^hsl\((\d+), 82%, 40%\)$/, `hsl($1, 82%, ${TEXT_LIGHTNESS}%)`);
}
