import { ageFilterFromSelectValue } from '../domain/ageFilter';
import { selectVisibleStations, type VisibleStations } from '../domain/filters';
import type { Preferences } from '../domain/preferences';
import type { AgeFilter, BrandedStation, Car } from '../domain/types';
import type { AppState } from './appState';

export const selectActiveCar = (s: AppState): Car | null =>
  s.preferences.cars.find((c) => c.id === s.preferences.activeCarId) ?? null;

export const selectAgeFilter = (p: Preferences): AgeFilter =>
  ageFilterFromSelectValue(p.ageFilterPreset, p.ageFilterCustomDays);

export const selectIsCheckingHistory = (s: AppState): boolean => Object.keys(s.historyJobs).length > 0;

/** Remembers the last result and recomputes only when one of the inputs changed (by reference). */
function memoize<A extends readonly unknown[], R>(compute: (...args: A) => R): (...args: A) => R {
  let lastArgs: A | null = null;
  let lastResult!: R;
  return (...args) => {
    if (lastArgs && args.length === lastArgs.length && args.every((a, i) => a === lastArgs![i]))
      return lastResult;
    lastArgs = args;
    lastResult = compute(...args);
    return lastResult;
  };
}

/**
 * Creates a memoised selector for the stations to show. Only stations, staleness,
 * preferences, position and route matter, so history-job bookkeeping and other
 * changes don't trigger a recomputation.
 */
export function createVisibleStationsSelector(): (s: AppState) => VisibleStations {
  const compute = memoize(
    (
      stations: AppState['stations'],
      staleness: AppState['staleness'],
      p: Preferences,
      userPosition: AppState['userPosition'],
      route: AppState['route'],
    ) => {
      const car = p.cars.find((c) => c.id === p.activeCarId) ?? null;
      return selectVisibleStations(stations, {
        fuel: p.fuel,
        brands: p.brands,
        ageFilter: selectAgeFilter(p),
        staleness,
        userPosition,
        route,
        searchRadiusKm: p.searchRadiusKm,
        routeDetourKm: p.routeDetourKm,
        routeOnly: p.routeOnly,
        car,
        discounts: p.discounts,
        sortByTotalCost: p.sortByTotalCost,
      });
    },
  );
  return (s) => compute(s.stations, s.staleness, s.preferences, s.userPosition, s.route);
}

/** Brands of the loaded stations with how many stations each has, sorted (Spanish collation). */
export function countBrands(stations: readonly BrandedStation[]): [brand: string, count: number][] {
  const counts = new Map<string, number>();
  for (const s of stations) counts.set(s.brand, (counts.get(s.brand) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b, 'es'));
}
