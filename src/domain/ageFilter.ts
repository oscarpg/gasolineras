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
 * The choices offered in the age-filter menu, in display order. Options marked
 * `custom` use the user's "X days" value; the others have a fixed threshold.
 */
export const AGE_FILTER_OPTIONS = [
  { id: 'all', mode: 'all' },
  { id: 'updatedToday', mode: 'atMost', days: 0 },
  { id: 'atMost1', mode: 'atMost', days: 1 },
  { id: 'atMost2', mode: 'atMost', days: 2 },
  { id: 'atMost3', mode: 'atMost', days: 3 },
  { id: 'atMostCustom', mode: 'atMost', custom: true },
  { id: 'exactly1', mode: 'exactly', days: 1 },
  { id: 'exactly2', mode: 'exactly', days: 2 },
  { id: 'moreThan3', mode: 'moreThan', days: 3 },
  { id: 'moreThanCustom', mode: 'moreThan', custom: true },
] as const;

export type AgeFilterOption = (typeof AGE_FILTER_OPTIONS)[number]['id'];

export const AGE_FILTER_OPTION_IDS: readonly AgeFilterOption[] = AGE_FILTER_OPTIONS.map((o) => o.id);

export function isAgeFilterOption(value: unknown): value is AgeFilterOption {
  return typeof value === 'string' && (AGE_FILTER_OPTION_IDS as readonly string[]).includes(value);
}

/** Whether the option uses the custom "X days" value (so the X input should be shown). */
export function isCustomAgeOption(option: AgeFilterOption): boolean {
  return AGE_FILTER_OPTIONS.some((o) => o.id === option && 'custom' in o);
}

/** The filter an option stands for; `customDays` is used by the custom options. */
export function ageFilterFromOption(option: AgeFilterOption, customDays: number): AgeFilter {
  const o = AGE_FILTER_OPTIONS.find((x) => x.id === option) ?? AGE_FILTER_OPTIONS[0];
  if (o.mode === 'all') return { mode: 'all' };
  return { mode: o.mode, days: 'custom' in o ? customDays : o.days };
}

/** Values stored by preferences v1/v2 (Spanish codes of the original select) → options. */
export const LEGACY_AGE_FILTER_VALUES: Readonly<Record<string, AgeFilterOption>> = {
  TODAS: 'all',
  '0': 'updatedToday',
  '1': 'atMost1',
  '2': 'atMost2',
  '3': 'atMost3',
  MAX_X: 'atMostCustom',
  EXACTO_1: 'exactly1',
  EXACTO_2: 'exactly2',
  MAS_3: 'moreThan3',
  MAS_X: 'moreThanCustom',
};
