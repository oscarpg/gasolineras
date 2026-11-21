import { DEFAULT_FUEL } from '../config/fuels';
import type { AgeFilterOption } from './ageFilter';
import type { Car, Discount, FuelType } from './types';

export type Locale = 'es' | 'en';

/** Everything the user chooses that survives a reload. Persisted by storage/preferences.ts. */
export interface Preferences {
  schemaVersion: 3;
  fuel: FuelType;
  /** Chosen age-filter option (see AGE_FILTER_OPTIONS). */
  ageFilterOption: AgeFilterOption;
  /** The "X" days used by the custom age-filter options (1–10). */
  ageFilterCustomDays: number;
  /** Max distance from the user's location (1–50 km). */
  searchRadiusKm: number;
  /** Max detour from the route (1–10 km). */
  routeDetourKm: number;
  /** Only stations right on the route. */
  routeOnly: boolean;
  /** Sort by tank + trip cost instead of €/l. */
  sortByTotalCost: boolean;
  /** Brands to show; empty = all. */
  brands: string[];
  /** Discount per brand. */
  discounts: Record<string, Discount>;
  cars: Car[];
  activeCarId: string | null;
  /** UI language; `null` = follow the browser. */
  locale: Locale | null;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  schemaVersion: 3,
  fuel: DEFAULT_FUEL,
  ageFilterOption: 'all',
  ageFilterCustomDays: 3,
  searchRadiusKm: 15,
  routeDetourKm: 3,
  routeOnly: false,
  sortByTotalCost: false,
  brands: [],
  discounts: {},
  cars: [],
  activeCarId: null,
  locale: null,
});

/** Allowed range of the custom age-filter days input. */
export const MIN_CUSTOM_AGE_DAYS = 1;
export const MAX_CUSTOM_AGE_DAYS = 10;
