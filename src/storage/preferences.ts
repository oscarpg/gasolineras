import { DEFAULT_FUEL, isFuelType } from '../config/fuels';
import { isAgeFilterPreset, type AgeFilterPreset } from '../domain/ageFilter';
import type { Car, Discount, FuelType } from '../domain/types';
import type { StorageAdapter } from './adapter';

/** Storage key for the current preferences format. */
export const PREFERENCES_KEY = 'gasolineras.preferences';
/** Storage key used by the original single-file app (format v1). Read once to migrate, never written. */
export const LEGACY_PREFERENCES_KEY = 'gasolineras_prefs';

export type Locale = 'es' | 'en';

export interface Preferences {
  schemaVersion: 2;
  fuel: FuelType;
  /** Value of the age-filter select; reworked in Phase 5. */
  ageFilterPreset: AgeFilterPreset;
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
  /** UI language; `null` = follow the browser (Phase 5). */
  locale: Locale | null;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  schemaVersion: 2,
  fuel: DEFAULT_FUEL,
  ageFilterPreset: 'TODAS',
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

/* ---------- validation helpers ---------- */

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const positive = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
};
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const nonEmptyString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function sanitizeDiscounts(raw: unknown, read: (d: Loose) => { type: unknown; value: unknown }) {
  const result: Record<string, Discount> = {};
  if (!isObject(raw)) return result;
  for (const [brand, d] of Object.entries(raw)) {
    if (!isObject(d)) continue;
    const { type, value } = read(d);
    const v = positive(value);
    if ((type === 'CTS' || type === 'PCT') && v !== null) result[brand] = { type, value: v };
  }
  return result;
}

function sanitizeCars(raw: unknown, read: (c: Loose) => Loose): Car[] {
  if (!Array.isArray(raw)) return [];
  const cars: Car[] = [];
  for (const item of raw) {
    if (!isObject(item)) continue;
    const c = read(item);
    const id = nonEmptyString(c.id);
    const name = nonEmptyString(c.name);
    const tankLitres = positive(c.tankLitres);
    const consumptionL100km = positive(c.consumptionL100km);
    if (id && name && isFuelType(c.fuel) && tankLitres && consumptionL100km) {
      cars.push({ id, name, fuel: c.fuel, tankLitres, consumptionL100km });
    }
  }
  return cars;
}

/**
 * Turns anything (parsed JSON, possibly corrupted or from an older version)
 * into valid Preferences. Invalid fields fall back to their defaults.
 */
export function sanitizePreferences(raw: unknown): Preferences {
  const p = isObject(raw) ? raw : {};
  const d = DEFAULT_PREFERENCES;
  const customDays = parseInt(String(p.ageFilterCustomDays), 10);

  return {
    schemaVersion: 2,
    fuel: isFuelType(p.fuel) ? p.fuel : d.fuel,
    ageFilterPreset: isAgeFilterPreset(p.ageFilterPreset) ? p.ageFilterPreset : d.ageFilterPreset,
    ageFilterCustomDays: clamp(customDays || d.ageFilterCustomDays, 1, 10),
    searchRadiusKm: clamp(positive(p.searchRadiusKm) ?? d.searchRadiusKm, 1, 50),
    routeDetourKm: clamp(positive(p.routeDetourKm) ?? d.routeDetourKm, 1, 10),
    routeOnly: p.routeOnly === true,
    sortByTotalCost: p.sortByTotalCost === true,
    brands: Array.isArray(p.brands) ? p.brands.filter((b): b is string => typeof b === 'string') : [],
    discounts: sanitizeDiscounts(p.discounts, (x) => ({ type: x.type, value: x.value })),
    cars: sanitizeCars(p.cars, (x) => x),
    activeCarId: nonEmptyString(p.activeCarId),
    locale: p.locale === 'es' || p.locale === 'en' ? p.locale : null,
  };
}

/**
 * Converts preferences saved by the original app (key `gasolineras_prefs`).
 *
 * v1 shape: { fuel, antiguedad, antiguedadDias, searchRadius, radius, soloRuta,
 *   sortByRealCost, brands, discounts: {brand: {tipo, valor}},
 *   cars: [{id, nombre, fuel, deposito, consumo}], activeCarId }
 */
export function migrateV1(raw: unknown): Preferences {
  const v1 = isObject(raw) ? raw : {};
  return sanitizePreferences({
    fuel: v1.fuel,
    ageFilterPreset: v1.antiguedad,
    ageFilterCustomDays: v1.antiguedadDias,
    searchRadiusKm: v1.searchRadius,
    routeDetourKm: v1.radius,
    routeOnly: !!v1.soloRuta,
    sortByTotalCost: !!v1.sortByRealCost,
    brands: v1.brands,
    discounts: isObject(v1.discounts)
      ? Object.fromEntries(
          Object.entries(v1.discounts).map(([brand, d]) => [
            brand,
            isObject(d) ? { type: d.tipo, value: d.valor } : null,
          ]),
        )
      : {},
    cars: Array.isArray(v1.cars)
      ? v1.cars.map((c) =>
          isObject(c)
            ? { id: c.id, name: c.nombre, fuel: c.fuel, tankLitres: c.deposito, consumptionL100km: c.consumo }
            : null,
        )
      : [],
    activeCarId: v1.activeCarId,
  });
}

function parse(json: string | null): unknown {
  if (json == null) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/**
 * Loads preferences: the current format if present, otherwise the original
 * app's format (migrated), otherwise defaults. Never throws.
 */
export function loadPreferences(storage: StorageAdapter): Preferences {
  const current = parse(storage.getItem(PREFERENCES_KEY));
  if (current !== undefined) return sanitizePreferences(current);

  const legacy = parse(storage.getItem(LEGACY_PREFERENCES_KEY));
  if (legacy !== undefined) return migrateV1(legacy);

  return sanitizePreferences({});
}

/** Saves preferences (validated). Returns false if storage is unavailable or full. */
export function savePreferences(storage: StorageAdapter, preferences: Preferences): boolean {
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(sanitizePreferences(preferences)));
    return true;
  } catch {
    return false;
  }
}
