import { BRAND_ALIASES, KNOWN_BRANDS, UNBRANDED } from '../config/brands';

const stripAccents = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Known brands pre-compiled as whole-word regexes, in priority order. */
const BRAND_MATCHERS = KNOWN_BRANDS.map((brand) => ({
  brand,
  regex: new RegExp(`(^|[^A-Z0-9])${stripAccents(brand)}([^A-Z0-9]|$)`),
}));

const GENERIC_PREFIX = /^(E\.?\s*S\.?|ESTACION\s+DE\s+SERVICIO|GASOLINERA|AREA\s+DE\s+SERVICIO)\s+/i;

/**
 * Turns a station sign ("Rótulo") into a brand name.
 *
 * 1. If a known brand appears as a whole word, returns that brand.
 * 2. Otherwise strips generic prefixes ("E.S.", "GASOLINERA"…) and keeps the
 *    text before the first " - ", " / " or " , " separator.
 * 3. Empty result → "SIN MARCA".
 */
export function normalizeBrand(sign = ''): string {
  let clean = stripAccents(sign.toUpperCase().trim());

  for (const { brand, regex } of BRAND_MATCHERS) {
    if (regex.test(clean)) return BRAND_ALIASES[brand] ?? brand;
  }

  clean = (clean.replace(GENERIC_PREFIX, '').split(/\s+[-/,]\s+/)[0] ?? '').trim();

  return clean || UNBRANDED;
}
