import { describe, expect, it } from 'vitest';
import { computeProvinceStaleness } from '../../src/domain/staleness';
import { prices, station } from '../state/fixtures';

const window = [
  { daysAgo: 1, date: '20-11-2026' },
  { daysAgo: 2, date: '19-11-2026' },
  { daysAgo: 3, date: '18-11-2026' },
];

describe('computeProvinceStaleness', () => {
  it('computes each fuel of each station against the history', () => {
    const s = station('A', { prices: prices({ GASOLINA_95: 1.5, GASOLEO_A: 1.4 }) });
    const history = [
      { A: { GASOLINA_95: 1.5, GASOLEO_A: 1.39 } },
      { A: { GASOLINA_95: 1.5 } },
      { A: { GASOLINA_95: 1.48 } },
    ];
    expect(computeProvinceStaleness([s], window, history, '21-11-2026')).toEqual({
      A: {
        GASOLEO_A: { days: 0, since: '21/11/2026', windowDays: 3 },
        GASOLINA_95: { days: 2, since: '19-11-2026', windowDays: 3 },
      },
    });
  });

  it('skips stations without a MITECO code and treats missing days as a stop', () => {
    const noCode = station('X', { code: '' });
    const s = station('B', { bulletinDate: '' });
    const result = computeProvinceStaleness(
      [noCode, s],
      window,
      [{ B: { GASOLINA_95: 1.5 } }, null, { B: { GASOLINA_95: 1.5 } }],
      '21-11-2026',
    );
    expect(Object.keys(result)).toEqual(['B']);
    expect(result.B!.GASOLINA_95).toEqual({ days: 1, since: '20-11-2026', windowDays: 3 });
  });

  it('uses today as "since" when the station has no bulletin date', () => {
    const s = station('C', { bulletinDate: '' });
    expect(computeProvinceStaleness([s], window, [{}, {}, {}], '21-11-2026').C!.GASOLINA_95!.since).toBe(
      '21-11-2026',
    );
  });
});
