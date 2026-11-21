import { describe, expect, it } from 'vitest';
import { ageFilterFromSelectValue, matchesAgeFilter, requiredHistoryDays } from '../../src/domain/ageFilter';
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

describe('ageFilterFromSelectValue', () => {
  it('maps every select option', () => {
    expect(ageFilterFromSelectValue('TODAS', 5)).toEqual({ mode: 'all' });
    expect(ageFilterFromSelectValue('0', 5)).toEqual({ mode: 'atMost', days: 0 });
    expect(ageFilterFromSelectValue('3', 5)).toEqual({ mode: 'atMost', days: 3 });
    expect(ageFilterFromSelectValue('MAX_X', 5)).toEqual({ mode: 'atMost', days: 5 });
    expect(ageFilterFromSelectValue('EXACTO_1', 5)).toEqual({ mode: 'exactly', days: 1 });
    expect(ageFilterFromSelectValue('EXACTO_2', 5)).toEqual({ mode: 'exactly', days: 2 });
    expect(ageFilterFromSelectValue('MAS_3', 5)).toEqual({ mode: 'moreThan', days: 3 });
    expect(ageFilterFromSelectValue('MAS_X', 7)).toEqual({ mode: 'moreThan', days: 7 });
  });

  it('treats unknown values as "all"', () => {
    expect(ageFilterFromSelectValue('', 5)).toEqual({ mode: 'all' });
    expect(ageFilterFromSelectValue('NOPE', 5)).toEqual({ mode: 'all' });
  });
});
