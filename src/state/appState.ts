import type { Preferences } from '../domain/preferences';
import type { BrandedStation, LatLng, StalenessIndex } from '../domain/types';

/** A running price-history check for one province. */
export interface HistoryJob {
  province: string;
  /** How many past days are being compared. */
  days: number;
}

/** What the history-check indicator shows: the latest job's outcome, or "loading" while any job runs. */
export type HistoryStatus = { status: 'loading' | 'done' | 'error'; days: number } | null;

/** Everything the app knows. Replaced (never mutated) on every change. */
export interface AppState {
  preferences: Preferences;
  /** All stations loaded so far, in load order (which is also the tie-break order when sorting). */
  stations: BrandedStation[];
  staleness: StalenessIndex;
  /** Provinces whose stations have been loaded. */
  loadedProvinces: string[];
  /** Per province, how many past days the applied staleness covers. */
  historyDepth: Record<string, number>;
  /** History checks in progress, by job id. */
  historyJobs: Record<number, HistoryJob>;
  historyStatus: HistoryStatus;
  /** Origin chosen by GPS or address search. */
  userPosition: LatLng | null;
  route: LatLng[] | null;
}

/**
 * Initial state from saved preferences. Like the original app: if no car is
 * marked active but cars exist, the first one becomes active, and the active
 * car's fuel wins over the saved fuel.
 */
export function createInitialState(saved: Preferences): AppState {
  const activeCarId = saved.activeCarId ?? saved.cars[0]?.id ?? null;
  const activeCar = saved.cars.find((c) => c.id === activeCarId);
  return {
    preferences: { ...saved, activeCarId, fuel: activeCar ? activeCar.fuel : saved.fuel },
    stations: [],
    staleness: {},
    loadedProvinces: [],
    historyDepth: {},
    historyJobs: {},
    historyStatus: null,
    userPosition: null,
    route: null,
  };
}
