import type { AgeFilter } from './types';

/** History is always fetched at least this many days back. */
export const MIN_HISTORY_DAYS = 4;
/** …and never more than this (MITECO history requests are one per day). */
export const MAX_HISTORY_DAYS = 10;

/**
 * Whether a station whose price has been unchanged for `daysStale` days passes the filter.
 * Unknown staleness (history not loaded yet) always passes, so stations don't flicker out.
 */
export function matchesAgeFilter(daysStale: number | null | undefined, filter: AgeFilter): boolean {
  if (filter.mode === 'all' || daysStale == null) return true;
  switch (filter.mode) {
    case 'atMost':
      return daysStale <= filter.days;
    case 'exactly':
      return daysStale === filter.days;
    case 'moreThan':
      return daysStale > filter.days;
  }
}

/**
 * How many past days of history are needed to evaluate the filter.
 * One more than the filter's threshold (to tell "N days" from "more than N"),
 * clamped to [MIN_HISTORY_DAYS, MAX_HISTORY_DAYS].
 */
export function requiredHistoryDays(filter: AgeFilter): number {
  if (filter.mode === 'all') return MIN_HISTORY_DAYS;
  return Math.max(MIN_HISTORY_DAYS, Math.min(MAX_HISTORY_DAYS, filter.days + 1));
}

/**
 * Converts the values of the current "antigüedad" <select> (also stored in saved
 * preferences) into an AgeFilter. Unknown values mean "all".
 *
 * @param value      select value: "TODAS", "0".."3", "MAX_X", "EXACTO_1", "EXACTO_2", "MAS_3", "MAS_X"
 * @param customDays the "X" input, used by MAX_X and MAS_X
 */
export function ageFilterFromSelectValue(value: string, customDays: number): AgeFilter {
  switch (value) {
    case '0':
    case '1':
    case '2':
    case '3':
      return { mode: 'atMost', days: Number(value) };
    case 'MAX_X':
      return { mode: 'atMost', days: customDays };
    case 'EXACTO_1':
      return { mode: 'exactly', days: 1 };
    case 'EXACTO_2':
      return { mode: 'exactly', days: 2 };
    case 'MAS_3':
      return { mode: 'moreThan', days: 3 };
    case 'MAS_X':
      return { mode: 'moreThan', days: customDays };
    default:
      return { mode: 'all' };
  }
}
