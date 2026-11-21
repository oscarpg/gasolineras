import { describe, expect, it } from 'vitest';
import { computeStaleness, samePrice, type HistoryDay } from '../../src/domain/staleness';

const day = (daysAgo: number, price: number | null): HistoryDay => ({
  daysAgo,
  date: `${String(21 - daysAgo).padStart(2, '0')}-11-2026`,
  price,
});

describe('samePrice', () => {
  it('treats differences below half a tenth of a cent as equal', () => {
    expect(samePrice(1.459, 1.4594)).toBe(true);
    expect(samePrice(1.459, 1.46)).toBe(false);
  });
});

describe('computeStaleness', () => {
  it('is 0 days since today when the price changed since yesterday', () => {
    expect(computeStaleness(1.5, [day(1, 1.49), day(2, 1.5)], '21-11-2026')).toEqual({
      days: 0,
      since: '21-11-2026',
    });
  });

  it('counts consecutive matching days and reports the oldest matching date', () => {
    expect(computeStaleness(1.5, [day(1, 1.5), day(2, 1.5), day(3, 1.48)], '21-11-2026')).toEqual({
      days: 2,
      since: '19-11-2026',
    });
  });

  it('stops at the first day without data (missing day or no price)', () => {
    expect(computeStaleness(1.5, [day(1, 1.5), null, day(3, 1.5)], '21-11-2026').days).toBe(1);
    expect(computeStaleness(1.5, [day(1, null), day(2, 1.5)], '21-11-2026').days).toBe(0);
  });

  it('reports the full window when every day matches (price is at least that old)', () => {
    const history = [1, 2, 3, 4].map((d) => day(d, 1.5));
    expect(computeStaleness(1.5, history, '21-11-2026')).toEqual({ days: 4, since: '17-11-2026' });
  });

  it('handles an empty history', () => {
    expect(computeStaleness(1.5, [], '21-11-2026')).toEqual({ days: 0, since: '21-11-2026' });
  });
});
