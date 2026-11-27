import { BRAND_BADGES, DEFAULT_BRAND_BADGE } from '../../config/brandBadges';
import { UNBRANDED } from '../../config/brands';
import { textColorFor } from '../../domain/colorScale';
import { html, raw } from '../dom';
import type { LeafletIcon, LeafletStatic } from './leaflet';

/** Red dot for the user's location / route origin. */
export const userIcon = (L: LeafletStatic): LeafletIcon =>
  L.divIcon({ className: 'user-marker', iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10] });

export interface StationTag {
  /** Brand as worked out from the sign (see normalizeBrand). */
  brand: string;
  /** Price shown in the tag, already formatted. */
  price: string;
  /** The station's price colour (green → red). */
  color: string;
}

export interface StationIconOptions {
  /** The station picked last: drawn bigger and outlined. */
  selected?: boolean;
  /** Touch screen: the tag gets extra transparent padding, so a tap near it hits it (WCAG 2.5.5). */
  touch?: boolean;
}

/** Up to two letters for a brand: "REPSOL" → "RE", "GAS EXPRESS" → "GE", "Q8" → "Q8". */
export function brandInitials(brand: string): string {
  if (!brand || brand === UNBRANDED) return '';
  const words = brand.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.map((w) => w[0]).join('') : brand;
  return letters.slice(0, 2).toUpperCase();
}

/** Fuel pump, for stations without a recognisable brand. */
const PUMP_SVG = raw(
  '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M5 3h8a1 1 0 0 1 1 1v7h1a2 2 0 0 1 2 2v4a1 1 0 0 0 2 0V9.4l-2.7-2.7 1.4-1.4 3 3c.2.2.3.4.3.7V17a3 3 0 0 1-6 0v-4h-1v7h1v1H3v-1h1V4a1 1 0 0 1 1-1zm1 2v5h6V5H6z"/></svg>',
);

function badgeHtml(brand: string) {
  const badge = BRAND_BADGES[brand] ?? DEFAULT_BRAND_BADGE;
  if (badge.logo) {
    const src = `${import.meta.env.BASE_URL}${badge.logo}`;
    return html`<span class="station-tag__logo has-image"><img src="${src}" alt="" decoding="async"></span>`;
  }
  return html`<span class="station-tag__logo" style="background:${badge.background};color:${badge.foreground}">${brandInitials(brand) || PUMP_SVG}</span>`;
}

/**
 * A boxed tag with the brand badge and the price, pointing down at the station.
 *
 * The icon itself is a 0×0 box anchored at the station; the tag is drawn above it
 * by CSS, so the pointer's tip lands on the location whatever the tag's width.
 * When the map is zoomed out, CSS shrinks the tag to a coloured dot (see mapView.ts).
 */
export function stationIcon(
  L: LeafletStatic,
  { brand, price, color }: StationTag,
  { selected = false, touch = false }: StationIconOptions = {},
): LeafletIcon {
  const tag = html`<div class="station-tag" style="--tag-color:${color};--tag-price-bg:${textColorFor(color)}">${badgeHtml(brand)}<span class="station-tag__price">${price}</span></div>`;
  const className = `station-marker${selected ? ' is-selected' : ''}${touch ? ' is-touch' : ''}`;
  return L.divIcon({
    className,
    html: tag.value,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -40],
  });
}
