/** Core domain types. Pure data: no DOM, no Leaflet, no I/O. */

/** Latitude, longitude in decimal degrees (WGS84). */
export type LatLng = readonly [lat: number, lon: number];

export type FuelType =
  'GASOLEO_A' | 'GASOLEO_PREMIUM' | 'GASOLINA_95' | 'GASOLINA_98' | 'GLP' | 'GNC' | 'GNL';

/** €/litre per fuel; `null` when the station doesn't sell it. */
export type FuelPrices = Record<FuelType, number | null>;

/** The parts of a car that matter for cost calculations. */
export interface CarSpecs {
  tankLitres: number;
  consumptionL100km: number;
}

/** `CTS` = euro cents per litre off; `PCT` = percentage off. Values kept for saved-prefs compatibility. */
export type DiscountType = 'CTS' | 'PCT';

export interface Discount {
  type: DiscountType;
  value: number;
}

/** How long a station's price has stayed the same. */
export interface Staleness {
  /** Consecutive past days with the same price as today (0 = changed since yesterday). */
  days: number;
  /** Bulletin date (dd-mm-yyyy) from which the current price has been unchanged. */
  since: string;
}

/** Filter on how many days a price has gone without changing. */
export type AgeFilter =
  | { mode: 'all' }
  | { mode: 'atMost'; days: number }
  | { mode: 'exactly'; days: number }
  | { mode: 'moreThan'; days: number };
