/**
 * How each brand is drawn in its map marker.
 *
 * `logo` is a path under `public/` (e.g. `brands/repsol.svg`), served from the app's
 * base URL. Without a logo, the marker shows the brand's initials on `background`.
 * Brands not listed here get the neutral fallback.
 */
export interface BrandBadge {
  background: string;
  foreground: string;
  logo?: string;
}

export const BRAND_BADGES: Readonly<Record<string, BrandBadge>> = {
  REPSOL: { background: '#e35205', foreground: '#ffffff', logo: 'brands/repsol.svg' },
  MOEVE: { background: '#00a19a', foreground: '#ffffff', logo: 'brands/moeve.svg' },
  CEPSA: { background: '#d6001c', foreground: '#ffffff', logo: 'brands/cepsa.svg' },
  GALP: { background: '#ee7203', foreground: '#ffffff' },
  BP: { background: '#007f00', foreground: '#ffffff' },
  SHELL: { background: '#fbce07', foreground: '#dd1d21' },
  PLENOIL: { background: '#1b3f8b', foreground: '#ffffff' },
  BALLENOIL: { background: '#0071bc', foreground: '#ffffff' },
  PETROPRIX: { background: '#e30613', foreground: '#ffffff' },
  CARREFOUR: { background: '#004e9f', foreground: '#ffffff' },
  ALCAMPO: { background: '#e2001a', foreground: '#ffffff' },
  EROSKI: { background: '#e30613', foreground: '#ffffff' },
  BONAREA: { background: '#e4002b', foreground: '#ffffff' },
  AVIA: { background: '#e2001a', foreground: '#ffffff' },
  Q8: { background: '#003b7a', foreground: '#ffd100' },
  PETRONOR: { background: '#00843d', foreground: '#ffffff' },
  CAMPSA: { background: '#c8102e', foreground: '#ffffff' },
  DISA: { background: '#e30613', foreground: '#ffffff' },
  COSTCO: { background: '#005daa', foreground: '#ffffff' },
};

export const DEFAULT_BRAND_BADGE: BrandBadge = { background: '#546e7a', foreground: '#ffffff' };
