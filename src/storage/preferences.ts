import { isFuelType } from '../config/fuels';
import { isAgeFilterOption, LEGACY_AGE_FILTER_VALUES } from '../domain/ageFilter';
import {
  DEFAULT_PREFERENCES,
  MAX_CUSTOM_AGE_DAYS,
  MIN_CUSTOM_AGE_DAYS,
  type Preferences,
} from '../domain/preferences';
import type { FavouriteStation } from '../domain/preferences';
import type { Car, Discount } from '../domain/types';
import type { StorageAdapter } from './adapter';

/** Storage key for the current preferences format. */
export const PREFERENCES_KEY = 'gasolineras.preferences';
/** Storage key used by the original single-file app (format v1). Read once to migrate, never written. */
export const LEGACY_PREFERENCES_KEY = 'gasolineras_prefs';

export { DEFAULT_PREFERENCES, type Locale, type Preferences } from '../domain/preferences';

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

const PROVINCE_CODE = /^(0[1-9]|[1-4]\d|5[0-2])$/;

/**
 * Valid favourites, without duplicate ids. The province is read from `provinceCode`,
 * or from `province` (the key the Android app writes).
 */
function sanitizeFavourites(raw: unknown): FavouriteStation[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const favourites: FavouriteStation[] = [];
  for (const item of raw) {
    if (!isObject(item)) continue;
    const id = nonEmptyString(item.id);
    const provinceCode = item.provinceCode ?? item.province;
    if (!id || seen.has(id) || typeof provinceCode !== 'string' || !PROVINCE_CODE.test(provinceCode))
      continue;
    seen.add(id);
    favourites.push({ id, provinceCode, brand: typeof item.brand === 'string' ? item.brand : '' });
  }
  return favourites;
}

/**
 * Turns anything (parsed JSON, possibly corrupted or from an older version)
 * into valid Preferences. Invalid fields fall back to their defaults.
 *
 * Also upgrades v2 (schemaVersion 2): its `ageFilterPreset` held the Spanish codes
 * of the original select ("TODAS", "MAS_X"…), now `ageFilterOption`. v3 lacked
 * `sortByDistance` and `favourites`, which take their defaults.
 */
export function sanitizePreferences(raw: unknown): Preferences {
  const p = isObject(raw) ? raw : {};
  const d = DEFAULT_PREFERENCES;
  const customDays = parseInt(String(p.ageFilterCustomDays), 10);

  return {
    schemaVersion: 4,
    fuel: isFuelType(p.fuel) ? p.fuel : d.fuel,
    ageFilterOption: isAgeFilterOption(p.ageFilterOption)
      ? p.ageFilterOption
      : (LEGACY_AGE_FILTER_VALUES[String(p.ageFilterPreset)] ?? d.ageFilterOption),
    ageFilterCustomDays: clamp(customDays || d.ageFilterCustomDays, MIN_CUSTOM_AGE_DAYS, MAX_CUSTOM_AGE_DAYS),
    searchRadiusKm: clamp(positive(p.searchRadiusKm) ?? d.searchRadiusKm, 1, 50),
    routeDetourKm: clamp(positive(p.routeDetourKm) ?? d.routeDetourKm, 1, 10),
    routeOnly: p.routeOnly === true,
    sortByTotalCost: p.sortByTotalCost === true,
    sortByDistance: p.sortByDistance === true,
    brands: Array.isArray(p.brands) ? p.brands.filter((b): b is string => typeof b === 'string') : [],
    discounts: sanitizeDiscounts(p.discounts, (x) => ({ type: x.type, value: x.value })),
    cars: sanitizeCars(p.cars, (x) => x),
    activeCarId: nonEmptyString(p.activeCarId),
    locale: p.locale === 'es' || p.locale === 'en' ? p.locale : null,
    favourites: sanitizeFavourites(p.favourites),
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
    ageFilterPreset: v1.antiguedad, // upgraded to ageFilterOption by sanitizePreferences
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
