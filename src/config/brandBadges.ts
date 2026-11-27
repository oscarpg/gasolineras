/**
 * How each brand is drawn in its map marker.
 *
 * `logo` is a path under `public/` (e.g. `brands/repsol.svg`), served from the app's
 * base URL. Without a logo, the marker shows the brand's initials on `background`.
 * Brands not listed here get the neutral fallback.
 *
 * Logo files come from Wikipedia / Wikimedia Commons (credited in the map attribution
 * and the README); the logos are trademarks of their respective owners.
 */
export interface BrandBadge {
  background: string;
  foreground: string;
  logo?: string;
}

export const BRAND_BADGES: Readonly<Record<string, BrandBadge>> = {
  REPSOL: { background: '#e35205', foreground: '#ffffff', logo: 'brands/repsol.png' },
  MOEVE: { background: '#00a19a', foreground: '#ffffff', logo: 'brands/moeve.svg' },
  CEPSA: { background: '#d6001c', foreground: '#ffffff', logo: 'brands/cepsa.svg' },
  GALP: { background: '#ee7203', foreground: '#ffffff', logo: 'brands/galp.svg' },
  BP: { background: '#007f00', foreground: '#ffffff', logo: 'brands/bp.svg' },
  SHELL: { background: '#fbce07', foreground: '#dd1d21', logo: 'brands/shell.svg' },
  PLENOIL: { background: '#1b3f8b', foreground: '#ffffff' },
  BALLENOIL: { background: '#0071bc', foreground: '#ffffff', logo: 'brands/ballenoil.png' },
  PLENERGY: { background: '#f39200', foreground: '#ffffff', logo: 'brands/plenergy.svg' },
  EASYGAS: { background: '#e3141a', foreground: '#ffffff', logo: 'brands/easygas.png' },
  ENI: { background: '#ffd100', foreground: '#000000', logo: 'brands/eni.svg' },
  PETROPRIX: { background: '#e30613', foreground: '#ffffff', logo: 'brands/petroprix.png' },
  CARREFOUR: { background: '#004e9f', foreground: '#ffffff', logo: 'brands/carrefour.svg' },
  ALCAMPO: { background: '#e2001a', foreground: '#ffffff', logo: 'brands/alcampo.svg' },
  EROSKI: { background: '#e30613', foreground: '#ffffff', logo: 'brands/eroski.svg' },
  BONAREA: { background: '#e4002b', foreground: '#ffffff' },
  AVIA: { background: '#e2001a', foreground: '#ffffff' },
  Q8: { background: '#003b7a', foreground: '#ffd100' },
  PETRONOR: { background: '#00843d', foreground: '#ffffff', logo: 'brands/petronor.png' },
  CAMPSA: { background: '#c8102e', foreground: '#ffffff', logo: 'brands/campsa.png' },
  DISA: { background: '#e30613', foreground: '#ffffff' },
  COSTCO: { background: '#005daa', foreground: '#ffffff' },
};

export const DEFAULT_BRAND_BADGE: BrandBadge = { background: '#546e7a', foreground: '#ffffff' };
