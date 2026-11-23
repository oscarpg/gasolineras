import type { StationRow } from '../domain/filters';
import { brandLabel, pricePerLitre } from './format';
import { i18n } from './i18nContext';
import type { Toaster } from './toast';

/**
 * Google Maps directions to a point. It opens the Google Maps app on Android and
 * iOS when it is installed, and the website otherwise.
 */
export const directionsUrl = (lat: number, lon: number): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

/** A link that shows the point (used in shared text). */
export const placeUrl = (lat: number, lon: number): string =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

/**
 * The text shared for a station, as on Android:
 * "{brand} — {fuel}: {price} €/l", the address, and a map link.
 */
export function shareText(row: StationRow, fuelName: string): string {
  const s = row.station;
  return `${brandLabel(s.brand)} — ${fuelName}: ${pricePerLitre(row.finalPrice)}\n${s.address}\n${placeUrl(s.lat, s.lon)}`;
}

export interface ShareDeps {
  share?: (data: { text: string }) => Promise<void>;
  copy?: (text: string) => Promise<void>;
  toast: Toaster;
}

/**
 * Opens the system share sheet when there is one; otherwise copies the text and
 * says so. A cancelled share sheet is not an error.
 */
export async function shareStation(text: string, { share, copy, toast }: ShareDeps): Promise<void> {
  if (share) {
    try {
      await share({ text });
    } catch {
      // cancelled
    }
    return;
  }
  try {
    if (!copy) throw new Error('no clipboard');
    await copy(text);
    toast.show(i18n().t('station.copied'));
  } catch {
    toast.show(i18n().t('station.copyFailed'));
  }
}

/** The browser's share and clipboard functions, when available. */
export function browserShareDeps(toast: Toaster): ShareDeps {
  return {
    share: typeof navigator.share === 'function' ? (data) => navigator.share(data) : undefined,
    copy: navigator.clipboard ? (text) => navigator.clipboard.writeText(text) : undefined,
    toast,
  };
}
