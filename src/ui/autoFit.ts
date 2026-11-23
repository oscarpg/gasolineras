import type { VisibleStations } from '../domain/filters';
import type { LatLng } from '../domain/types';
import type { AppState } from '../state/appState';

/** How many of the cheapest stations the map fits, with the origin. */
export const FIT_CHEAPEST = 3;

/**
 * The inputs only the user changes: a new origin, fuel, car, sort, filters,
 * discounts, radius or favourites mode. Background updates (stations loading,
 * history checks, a refresh) leave them alone.
 */
function userInputs(s: AppState): readonly unknown[] {
  const p = s.preferences;
  return [
    s.userPosition,
    s.favouritesOnly,
    p.fuel,
    p.activeCarId,
    p.cars,
    p.sortByDistance,
    p.sortByTotalCost,
    p.brands.join('\n'),
    p.ageFilterOption,
    p.ageFilterCustomDays,
    p.searchRadiusKm,
    p.discounts,
  ];
}

const sameInputs = (a: readonly unknown[], b: readonly unknown[]) => a.every((x, i) => x === b[i]);

export interface AutoFit {
  /** Call on every render. Fits the map at most once per user change. */
  update(state: AppState, visible: VisibleStations): void;
}

/**
 * After a new origin or a user change, fits the map once to the origin and the
 * three cheapest stations, as soon as results exist (in favourites mode, to the
 * favourites). With a route nothing moves: the route was already fitted.
 */
export function createAutoFit(fit: (points: LatLng[]) => void): AutoFit {
  let last: readonly unknown[] | null = null;
  let pending = false;

  return {
    update(state, { rows }) {
      const inputs = userInputs(state);
      if (!last || !sameInputs(inputs, last)) {
        last = inputs;
        pending = true;
      }
      if (!pending) return;

      if (state.favouritesOnly) {
        if (rows.length === 0) return;
        fit(rows.map((r) => [r.station.lat, r.station.lon]));
        pending = false;
        return;
      }
      if (state.route) {
        pending = false;
        return;
      }
      // Wait for an origin and results (a province may still be loading).
      if (!state.userPosition || rows.length === 0) return;
      const cheapest = [...rows].sort((a, b) => a.metric - b.metric).slice(0, FIT_CHEAPEST);
      fit([state.userPosition, ...cheapest.map((r): LatLng => [r.station.lat, r.station.lon])]);
      pending = false;
    },
  };
}
