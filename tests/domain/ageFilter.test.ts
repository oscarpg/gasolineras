import { describe, expect, it } from 'vitest';
import {
  AGE_FILTER_OPTION_IDS,
  ageFilterFromOption,
  isAgeFilterOption,
  isCustomAgeOption,
  LEGACY_AGE_FILTER_VALUES,
  matchesAgeFilter,
  requiredHistoryDays,
} from '../../src/domain/ageFilter';
import type { AgeFilter } from '../../src/domain/types';

describe('matchesAgeFilter', () => {
  it('"all" lets everything through', () => {
    expect(matchesAgeFilter(0, { mode: 'all' })).toBe(true);
    expect(matchesAgeFilter(9, { mode: 'all' })).toBe(true);
  });

  it('unknown staleness always passes', () => {
    expect(matchesAgeFilter(undefined, { mode: 'exactly', days: 1 })).toBe(true);
    expect(matchesAgeFilter(null, { mode: 'moreThan', days: 3 })).toBe(true);
  });

  it('atMost / exactly / moreThan', () => {
    const atMost2: AgeFilter = { mode: 'atMost', days: 2 };
    expect([0, 1, 2, 3].map((d) => matchesAgeFilter(d, atMost2))).toEqual([true, true, true, false]);

    const exactly1: AgeFilter = { mode: 'exactly', days: 1 };
    expect([0, 1, 2].map((d) => matchesAgeFilter(d, exactly1))).toEqual([false, true, false]);

    const moreThan3: AgeFilter = { mode: 'moreThan', days: 3 };
    expect([3, 4, 9].map((d) => matchesAgeFilter(d, moreThan3))).toEqual([false, true, true]);
  });
});

describe('requiredHistoryDays', () => {
  it('fetches at least 4 days', () => {
    expect(requiredHistoryDays({ mode: 'all' })).toBe(4);
    expect(requiredHistoryDays({ mode: 'atMost', days: 0 })).toBe(4);
    expect(requiredHistoryDays({ mode: 'moreThan', days: 3 })).toBe(4);
  });

  it('fetches one day more than the threshold, up to 10', () => {
    expect(requiredHistoryDays({ mode: 'moreThan', days: 5 })).toBe(6);
    expect(requiredHistoryDays({ mode: 'atMost', days: 9 })).toBe(10);
    expect(requiredHistoryDays({ mode: 'atMost', days: 30 })).toBe(10);
  });
});

describe('age filter options', () => {
  it('maps every option to its filter', () => {
    expect(ageFilterFromOption('all', 5)).toEqual({ mode: 'all' });
    expect(ageFilterFromOption('updatedToday', 5)).toEqual({ mode: 'atMost', days: 0 });
    expect(ageFilterFromOption('atMost3', 5)).toEqual({ mode: 'atMost', days: 3 });
    expect(ageFilterFromOption('atMostCustom', 5)).toEqual({ mode: 'atMost', days: 5 });
    expect(ageFilterFromOption('exactly1', 5)).toEqual({ mode: 'exactly', days: 1 });
    expect(ageFilterFromOption('exactly2', 5)).toEqual({ mode: 'exactly', days: 2 });
    expect(ageFilterFromOption('moreThan3', 5)).toEqual({ mode: 'moreThan', days: 3 });
    expect(ageFilterFromOption('moreThanCustom', 7)).toEqual({ mode: 'moreThan', days: 7 });
  });

  it('knows which options use the custom days', () => {
    expect(AGE_FILTER_OPTION_IDS.filter(isCustomAgeOption)).toEqual(['atMostCustom', 'moreThanCustom']);
  });

  it('validates option ids', () => {
    expect(isAgeFilterOption('moreThan3')).toBe(true);
    expect(isAgeFilterOption('MAS_3')).toBe(false);
    expect(isAgeFilterOption(undefined)).toBe(false);
  });

  it('maps every value the original select stored to an option with the same meaning', () => {
    const old: Record<string, unknown> = {
      TODAS: { mode: 'all' },
      '0': { mode: 'atMost', days: 0 },
      '1': { mode: 'atMost', days: 1 },
      '2': { mode: 'atMost', days: 2 },
      '3': { mode: 'atMost', days: 3 },
      MAX_X: { mode: 'atMost', days: 6 },
      EXACTO_1: { mode: 'exactly', days: 1 },
      EXACTO_2: { mode: 'exactly', days: 2 },
      MAS_3: { mode: 'moreThan', days: 3 },
      MAS_X: { mode: 'moreThan', days: 6 },
    };
    for (const [legacy, filter] of Object.entries(old)) {
      expect(ageFilterFromOption(LEGACY_AGE_FILTER_VALUES[legacy]!, 6)).toEqual(filter);
    }
  });
});
