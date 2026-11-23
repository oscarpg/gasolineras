/**
 * Pure state transitions: `(state, ...args) => newState`.
 * Every change the user or the app makes goes through one of these, via `store.update`.
 */
import { normalizeBrand } from '../domain/brands';
import {
  DEFAULT_PREFERENCES,
  FILTER_KEYS,
  MAX_CUSTOM_AGE_DAYS,
  MAX_SEARCH_RADIUS_KM,
  MIN_CUSTOM_AGE_DAYS,
  WIDEN_STEP_KM,
  type Preferences,
} from '../domain/preferences';
import type {
  BrandedStation,
  CarSpecs,
  Discount,
  FuelType,
  LatLng,
  StalenessIndex,
  Station,
} from '../domain/types';
import type { AppState, HistoryJob } from './appState';

/* ---------- preferences ---------- */

export function setPreferences(s: AppState, patch: Partial<Preferences>): AppState {
  return { ...s, preferences: { ...s.preferences, ...patch } };
}

/** Changing the fuel deactivates a car that uses a different fuel. */
export function setFuel(s: AppState, fuel: FuelType): AppState {
  const active = s.preferences.cars.find((c) => c.id === s.preferences.activeCarId);
  const activeCarId = active && active.fuel !== fuel ? null : s.preferences.activeCarId;
  return setPreferences(s, { fuel, activeCarId });
}

/** The "X" of the custom age filters, clamped to 1–10 (3 if not a number). */
export function setCustomAgeDays(s: AppState, value: number): AppState {
  const days = Math.min(MAX_CUSTOM_AGE_DAYS, Math.max(MIN_CUSTOM_AGE_DAYS, Math.trunc(value) || 3));
  return setPreferences(s, { ageFilterCustomDays: days });
}

/** "Widen to N km" (no results): the search radius plus 10 km, at most 50. */
export const widenedRadiusKm = (p: Preferences): number =>
  Math.min(MAX_SEARCH_RADIUS_KM, p.searchRadiusKm + WIDEN_STEP_KM);

export function widenSearch(s: AppState): AppState {
  return setPreferences(s, { searchRadiusKm: widenedRadiusKm(s.preferences) });
}

/** "Clear filters" (no results): no price-age filter and no brand filter; nothing else changes. */
export function clearFilters(s: AppState): AppState {
  return setPreferences(s, { ageFilterOption: 'all', brands: [] });
}

/** "Reset filters": the filters panel's preferences back to their defaults; nothing else changes. */
export function resetFilters(s: AppState): AppState {
  const defaults = Object.fromEntries(
    FILTER_KEYS.map((k) => [k, DEFAULT_PREFERENCES[k]]),
  ) as Partial<Preferences>;
  return setPreferences(s, { ...defaults, brands: [] });
}

/* ---------- cars ---------- */

/** Activates a car and switches to its fuel. */
export function selectCar(s: AppState, id: string): AppState {
  const car = s.preferences.cars.find((c) => c.id === id);
  return setPreferences(s, { activeCarId: id, ...(car ? { fuel: car.fuel } : {}) });
}

export interface CarInput extends CarSpecs {
  name: string;
  fuel: FuelType;
}

/**
 * Adds a car, or updates the one with the same name (case-insensitive), and
 * makes it the active car with its fuel selected.
 */
export function saveCar(s: AppState, input: CarInput, newId: string): AppState {
  const { cars } = s.preferences;
  const existing = cars.find((c) => c.name.toLowerCase() === input.name.toLowerCase());
  const spec = { fuel: input.fuel, tankLitres: input.tankLitres, consumptionL100km: input.consumptionL100km };

  const nextCars = existing
    ? cars.map((c) => (c.id === existing.id ? { ...c, ...spec } : c))
    : [...cars, { id: newId, name: input.name, ...spec }];

  return setPreferences(s, { cars: nextCars, activeCarId: existing ? existing.id : newId, fuel: input.fuel });
}

/**
 * Edits a car in place, by id: it keeps its id and whether it is active (so a rename
 * doesn't create a second car). If it is the active car, its fuel becomes the selected one.
 */
export function updateCar(s: AppState, id: string, input: CarInput): AppState {
  const { cars, activeCarId } = s.preferences;
  if (!cars.some((c) => c.id === id)) return s;
  const nextCars = cars.map((c) =>
    c.id === id
      ? {
          ...c,
          name: input.name,
          fuel: input.fuel,
          tankLitres: input.tankLitres,
          consumptionL100km: input.consumptionL100km,
        }
      : c,
  );
  return setPreferences(s, { cars: nextCars, ...(activeCarId === id ? { fuel: input.fuel } : {}) });
}

/** Removes a car. If it was active, the first remaining car (if any) becomes active, with its fuel. */
export function deleteCar(s: AppState, id: string): AppState {
  const cars = s.preferences.cars.filter((c) => c.id !== id);
  if (s.preferences.activeCarId !== id) return setPreferences(s, { cars });
  const next = cars[0];
  return setPreferences(s, { cars, activeCarId: next?.id ?? null, ...(next ? { fuel: next.fuel } : {}) });
}

/* ---------- discounts and brands ---------- */

export function setDiscount(s: AppState, brand: string, discount: Discount): AppState {
  return setPreferences(s, { discounts: { ...s.preferences.discounts, [brand]: discount } });
}

export function removeDiscount(s: AppState, brand: string): AppState {
  const discounts = { ...s.preferences.discounts };
  delete discounts[brand];
  return setPreferences(s, { discounts });
}

/**
 * The brand buttons: "Deselect all" (`all` = true) leaves no brand ticked, which means
 * no brand filter; "Select all" ticks every brand present.
 */
export function setAllBrands(s: AppState, all: boolean, brandsPresent: readonly string[]): AppState {
  return setPreferences(s, { brands: all ? [] : [...brandsPresent] });
}

export function setBrandSelected(s: AppState, brand: string, selected: boolean): AppState {
  const brands = s.preferences.brands.filter((b) => b !== brand);
  return setPreferences(s, { brands: selected ? [...brands, brand] : brands });
}

/* ---------- favourites ---------- */

/** Adds the station to favourites, or removes it if it already is one. */
export function toggleFavourite(s: AppState, station: BrandedStation): AppState {
  const { favourites } = s.preferences;
  return setPreferences(s, {
    favourites: favourites.some((f) => f.id === station.id)
      ? favourites.filter((f) => f.id !== station.id)
      : [...favourites, { id: station.id, provinceCode: station.provinceCode, brand: station.brand }],
  });
}

export function setFavouritesOnly(s: AppState, on: boolean): AppState {
  return s.favouritesOnly === on ? s : { ...s, favouritesOnly: on };
}

/* ---------- stations ---------- */

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Adds stations (deduplicated by id; with `replace`, existing ones are updated)
 * and drops brand-filter entries for brands that no loaded station has, so a
 * saved filter can't hide everything.
 */
export function addStations(s: AppState, incoming: readonly Station[], { replace = false } = {}): AppState {
  const stations = [...s.stations];
  const indexById = new Map(stations.map((st, i) => [st.id, i]));

  for (const station of incoming) {
    const branded = { ...station, brand: normalizeBrand(station.name) };
    const index = indexById.get(station.id);
    if (index === undefined) {
      indexById.set(station.id, stations.length);
      stations.push(branded);
    } else if (replace) {
      stations[index] = branded;
    }
  }

  const present = new Set(stations.map((st) => st.brand));
  const brands = s.preferences.brands.map((b) => normalizeBrand(b)).filter((b) => present.has(b));
  const preferences = sameList(brands, s.preferences.brands) ? s.preferences : { ...s.preferences, brands };

  return { ...s, stations, preferences };
}

export function markProvinceLoaded(s: AppState, province: string): AppState {
  return s.loadedProvinces.includes(province)
    ? s
    : { ...s, loadedProvinces: [...s.loadedProvinces, province] };
}

/* ---------- location and route ---------- */

export function setUserPosition(s: AppState, position: LatLng | null): AppState {
  return { ...s, userPosition: position };
}

export function setRoute(s: AppState, route: LatLng[] | null): AppState {
  return { ...s, route };
}

/* ---------- price history ---------- */

export function startHistoryJob(s: AppState, id: number, job: HistoryJob): AppState {
  return {
    ...s,
    historyJobs: { ...s.historyJobs, [id]: job },
    historyStatus: { status: 'loading', days: job.days },
  };
}

/**
 * Applies a finished history check (`result` = staleness, or `null` if it failed).
 * A result covering fewer days than one already applied for that province is
 * ignored, so a slow short check can't overwrite a longer one.
 * The indicator keeps showing "loading" while other checks are still running.
 */
export function finishHistoryJob(s: AppState, id: number, result: StalenessIndex | null): AppState {
  const job = s.historyJobs[id];
  if (!job) return s;
  const historyJobs = { ...s.historyJobs };
  delete historyJobs[id];

  let { staleness, historyDepth } = s;
  if (result && job.days >= (historyDepth[job.province] ?? 0)) {
    staleness = { ...staleness, ...result };
    historyDepth = { ...historyDepth, [job.province]: job.days };
  }

  const running = Object.values(historyJobs);
  const historyStatus = running.length
    ? { status: 'loading' as const, days: running[running.length - 1]!.days }
    : { status: result ? ('done' as const) : ('error' as const), days: job.days };

  return { ...s, staleness, historyDepth, historyJobs, historyStatus };
}

/** Forgets how deep each province's history was checked (used by "force refresh"). */
export function resetHistoryDepth(s: AppState): AppState {
  return { ...s, historyDepth: {} };
}
