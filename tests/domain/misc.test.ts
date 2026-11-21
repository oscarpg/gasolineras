import { describe, expect, it } from 'vitest';
import { colorForValue } from '../../src/domain/colorScale';
import { daysBefore, toMitecoDate } from '../../src/domain/dates';
import { parseSpanishNumber } from '../../src/domain/numbers';
import { significantPricePoints } from '../../src/domain/priceHistory';

describe('colorForValue', () => {
  it('goes from green (min) through yellow to red (max)', () => {
    expect(colorForValue(1, 1, 2)).toBe('hsl(120, 82%, 40%)');
    expect(colorForValue(1.5, 1, 2)).toBe('hsl(60, 82%, 40%)');
    expect(colorForValue(2, 1, 2)).toBe('hsl(0, 82%, 40%)');
  });

  it('is green when all values are equal', () => {
    expect(colorForValue(1.5, 1.5, 1.5)).toBe('hsl(120, 82%, 40%)');
  });
});

describe('toMitecoDate / daysBefore', () => {
  it('formats as dd-mm-yyyy with zero padding', () => {
    expect(toMitecoDate(new Date(2026, 0, 5))).toBe('05-01-2026');
    expect(toMitecoDate(new Date(2026, 10, 21))).toBe('21-11-2026');
  });

  it('subtracts days across month and year boundaries', () => {
    expect(toMitecoDate(daysBefore(new Date(2026, 2, 1), 1))).toBe('28-02-2026');
    expect(toMitecoDate(daysBefore(new Date(2026, 0, 2), 3))).toBe('30-12-2025');
  });

  it('does not modify the input date', () => {
    const d = new Date(2026, 10, 21);
    daysBefore(d, 5);
    expect(d.getDate()).toBe(21);
  });
});

describe('parseSpanishNumber', () => {
  it('accepts a decimal comma or dot', () => {
    expect(parseSpanishNumber('1,459')).toBe(1.459);
    expect(parseSpanishNumber('1.459')).toBe(1.459);
    expect(parseSpanishNumber(1.459)).toBe(1.459);
    expect(parseSpanishNumber('-3,70')).toBe(-3.7);
  });

  it('returns null for empty or invalid values', () => {
    expect(parseSpanishNumber('')).toBeNull();
    expect(parseSpanishNumber(null)).toBeNull();
    expect(parseSpanishNumber(undefined)).toBeNull();
    expect(parseSpanishNumber('n/a')).toBeNull();
  });
});

describe('significantPricePoints', () => {
  const series = (prices: (number | null)[]) =>
    prices.map((price, idx) => ({ idx, label: `d${idx}`, price }));

  it('keeps the first price, each change and the last day', () => {
    const points = significantPricePoints(series([1.5, 1.5, 1.52, 1.52, 1.49, 1.49, 1.49]));
    expect(points.map((p) => p.idx)).toEqual([0, 2, 4, 6]);
  });

  it('skips days without data', () => {
    const points = significantPricePoints(series([null, 1.5, null, 1.5, 1.51]));
    expect(points.map((p) => p.idx)).toEqual([1, 4]);
  });

  it('returns nothing when there is no data at all', () => {
    expect(significantPricePoints(series([null, null]))).toEqual([]);
  });

  it('keeps the last day even when the price did not change', () => {
    expect(significantPricePoints(series([1.5, 1.5, 1.5])).map((p) => p.idx)).toEqual([0, 2]);
  });
});
