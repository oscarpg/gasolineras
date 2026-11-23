import { DEFAULT_FUEL } from '../config/fuels';
import type { AgeFilterOption } from './ageFilter';
import type { Car, Discount, FuelType } from './types';

export type Locale = 'es' | 'en';

/** A saved favourite: enough to find it again (its province is loaded when favourites are shown). */
export interface FavouriteStation {
  id: string;
  /** Two-digit province code (01–52). */
  provinceCode: string;
  brand: string;
}

/** Everything the user chooses that survives a reload. Persisted by storage/preferences.ts. */
export interface Preferences {
  schemaVersion: 4;
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
  /** Sort nearest first (detour on a route); colours still show the price. */
  sortByDistance: boolean;
  /** Brands to show; empty = all. */
  brands: string[];
  /** Discount per brand. */
  discounts: Record<string, Discount>;
  cars: Car[];
  activeCarId: string | null;
  /** UI language; `null` = follow the browser. */
  locale: Locale | null;
  /** Favourite stations, shown wherever they are with the favourites chip. */
  favourites: FavouriteStation[];
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  schemaVersion: 4,
  fuel: DEFAULT_FUEL,
  ageFilterOption: 'all',
  ageFilterCustomDays: 3,
  searchRadiusKm: 15,
  routeDetourKm: 3,
  routeOnly: false,
  sortByTotalCost: false,
  sortByDistance: false,
  brands: [],
  discounts: {},
  cars: [],
  activeCarId: null,
  locale: null,
  favourites: [],
});

/** The preferences the filters panel sets ("Reset filters" restores their defaults). */
export const FILTER_KEYS = [
  'searchRadiusKm',
  'routeDetourKm',
  'routeOnly',
  'ageFilterOption',
  'ageFilterCustomDays',
  'brands',
] as const satisfies readonly (keyof Preferences)[];

/**
 * How many filters differ from the defaults, for the "Filters (N)" button: radius,
 * detour, route only, price age, and brands when some are chosen.
 */
export function activeFilterCount(p: Preferences): number {
  const d = DEFAULT_PREFERENCES;
  return [
    p.searchRadiusKm !== d.searchRadiusKm,
    p.routeDetourKm !== d.routeDetourKm,
    p.routeOnly !== d.routeOnly,
    p.ageFilterOption !== d.ageFilterOption,
    p.brands.length > 0,
  ].filter(Boolean).length;
}

/** Range of the search radius slider (km), and how much "widen" adds. */
export const MIN_SEARCH_RADIUS_KM = 1;
export const MAX_SEARCH_RADIUS_KM = 50;
export const WIDEN_STEP_KM = 10;

/** Allowed range of the custom age-filter days input. */
export const MIN_CUSTOM_AGE_DAYS = 1;
export const MAX_CUSTOM_AGE_DAYS = 10;
