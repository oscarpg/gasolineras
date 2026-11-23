import { describe, expect, it } from 'vitest';
import type { HistoryPrices, Station } from '../../src/domain/types';
import { createEffects } from '../../src/state/effects';
import { persistPreferences } from '../../src/state/persistence';
import { createVisibleStationsSelector } from '../../src/state/selectors';
import { createStore } from '../../src/state/store';
import { setFavouritesOnly, setPreferences, setRoute, setUserPosition } from '../../src/state/transitions';
import { prices, state, station } from './fixtures';

describe('createStore', () => {
  it('notifies listeners with new and previous state, only on real changes', () => {
    const store = createStore({ n: 0 });
    const seen: [number, number][] = [];
    const unsubscribe = store.subscribe((s, prev) => seen.push([s.n, prev.n]));
    store.update((s) => ({ n: s.n + 1 }));
    store.update((s) => s);
    unsubscribe();
    store.update((s) => ({ n: s.n + 1 }));
    expect(seen).toEqual([[1, 0]]);
    expect(store.getState().n).toBe(2);
  });
});

describe('createVisibleStationsSelector', () => {
  it('recomputes only when a relevant input changes', () => {
    const select = createVisibleStationsSelector();
    const s0 = setUserPosition(
      { ...state(), stations: [{ ...station('1'), brand: 'REPSOL' }] },
      [40.4, -3.7],
    );
    const r0 = select(s0);
    expect(r0.rows).toHaveLength(1);
    expect(select({ ...s0, historyStatus: { status: 'done', days: 4 } })).toBe(r0);
    expect(select(setPreferences(s0, { searchRadiusKm: 5 }))).not.toBe(r0);
  });

  it('passes the distance sort through', () => {
    const select = createVisibleStationsSelector();
    const s = setUserPosition(
      {
        ...state({ sortByDistance: true }),
        stations: [
          { ...station('far', { lat: 40.45, prices: prices({ GASOLINA_95: 1.4 }) }), brand: 'REPSOL' },
          { ...station('near', { lat: 40.41 }), brand: 'REPSOL' },
        ],
      },
      [40.4, -3.7],
    );
    expect(select(s).rows.map((r) => r.station.id)).toEqual(['near', 'far']);
    expect(select(s).sortedByDistance).toBe(true);
  });

  it('in favourites mode shows only favourites, ignoring the radius and the route', () => {
    const select = createVisibleStationsSelector();
    const s0 = setRoute(
      setUserPosition(
        {
          ...state({ favourites: [{ id: 'far', provinceCode: '07', brand: 'REPSOL' }] }),
          stations: [
            { ...station('far', { lat: 39.57, lon: 2.65 }), brand: 'REPSOL' },
            { ...station('near'), brand: 'REPSOL' },
          ],
        },
        [40.4, -3.7],
      ),
      [
        [40.4, -3.7],
        [40.5, -3.7],
      ],
    );
    expect(select(s0).rows.map((r) => r.station.id)).toEqual(['near']);
    const fav = setFavouritesOnly(s0, true);
    expect(select(fav).rows.map((r) => r.station.id)).toEqual(['far']);
    expect(select(fav).rows[0]!.routeDetourKm).toBeNull();
  });
});

/** Fake MITECO: stations per province; history = same prices as today for `stableDays` days. */
function fakeMiteco(stationsByProvince: Record<string, Station[]>, { failDates = [] as string[] } = {}) {
  const calls: string[] = [];
  return {
    calls,
    async getProvinceStations(code: string, { force = false } = {}) {
      calls.push(`stations:${code}${force ? ':force' : ''}`);
      const list = stationsByProvince[code];
      if (!list) throw new Error('No se pudo descargar la información de las gasolineras.');
      return list;
    },
    async getHistoryDay(code: string, date: string): Promise<HistoryPrices> {
      calls.push(`history:${code}:${date}`);
      if (failDates.includes(date)) throw new Error('offline');
      return Object.fromEntries(
        (stationsByProvince[code] ?? []).map((s) => [s.code, { GASOLINA_95: s.prices.GASOLINA_95! }]),
      );
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const NOW = () => new Date(2026, 10, 21, 12);

describe('createEffects', () => {
  it('loads a province, then checks the history depth the age filter needs', async () => {
    const store = createStore(state({ ageFilterOption: 'moreThanCustom', ageFilterCustomDays: 5 }));
    const miteco = fakeMiteco({ '28': [station('A', { prices: prices({ GASOLINA_95: 1.5 }) })] });
    const effects = createEffects({ store, miteco, now: NOW });

    await effects.loadProvince('28');
    expect(store.getState().loadedProvinces).toEqual(['28']);
    expect(store.getState().stations.map((s) => s.id)).toEqual(['A']);
    expect(store.getState().historyStatus).toEqual({ status: 'loading', days: 6 });

    await flush();
    const s = store.getState();
    expect(s.historyStatus).toEqual({ status: 'done', days: 6 });
    expect(s.historyDepth).toEqual({ '28': 6 });
    expect(s.staleness.A!.GASOLINA_95).toEqual({ days: 6, since: '15-11-2026', windowDays: 6 });
    expect(miteco.calls.filter((c) => c.startsWith('history'))).toHaveLength(6);
    expect(miteco.calls).toContain('history:28:20-11-2026');
  });

  it('propagates download errors and leaves the province unloaded', async () => {
    const store = createStore(state());
    const effects = createEffects({ store, miteco: fakeMiteco({}), now: NOW });
    await expect(effects.loadProvince('99')).rejects.toThrow('No se pudo descargar');
    expect(store.getState().loadedProvinces).toEqual([]);
  });

  it('a history day that fails only shortens the comparison', async () => {
    const store = createStore(state());
    const miteco = fakeMiteco({ '28': [station('A')] }, { failDates: ['19-11-2026'] });
    const effects = createEffects({ store, miteco, now: NOW });
    await effects.loadProvince('28');
    await flush();
    expect(store.getState().staleness.A!.GASOLINA_95!.days).toBe(1);
    expect(store.getState().historyStatus?.status).toBe('done');
  });

  it('ensureHistoryForFilter checks deeper only where needed', async () => {
    const store = createStore(state());
    const miteco = fakeMiteco({ '28': [station('A')], '46': [station('B', { provinceCode: '46' })] });
    const effects = createEffects({ store, miteco, now: NOW });
    await effects.loadProvince('28');
    await effects.loadProvince('46');
    await flush();
    const before = miteco.calls.length;

    await effects.ensureHistoryForFilter(); // default filter needs 4 days: already covered
    expect(miteco.calls.length).toBe(before);

    store.update((s) => setPreferences(s, { ageFilterOption: 'atMostCustom', ageFilterCustomDays: 7 }));
    await effects.ensureHistoryForFilter();
    expect(store.getState().historyDepth).toEqual({ '28': 8, '46': 8 });
  });

  it('a forced reload replaces station data', async () => {
    const data = { '28': [station('A', { prices: prices({ GASOLINA_95: 1.5 }) })] };
    const store = createStore(state());
    const effects = createEffects({ store, miteco: fakeMiteco(data), now: NOW });
    await effects.loadProvince('28');
    data['28'] = [station('A', { prices: prices({ GASOLINA_95: 1.44 }) })];
    await effects.loadProvince('28', { force: true });
    expect(store.getState().stations[0]!.prices.GASOLINA_95).toBe(1.44);
  });
});

describe('persistPreferences', () => {
  it('saves once after changes settle, and flush saves immediately', () => {
    const store = createStore(state());
    const saved: number[] = [];
    let scheduled: (() => void) | null = null;
    const p = persistPreferences(store, (prefs) => saved.push(prefs.searchRadiusKm), {
      schedule: (fn) => (scheduled = fn),
      cancel: () => (scheduled = null),
    });

    store.update((s) => setPreferences(s, { searchRadiusKm: 10 }));
    store.update((s) => setPreferences(s, { searchRadiusKm: 11 }));
    store.update((s) => setUserPosition(s, [1, 1])); // not a preference: ignored
    expect(saved).toEqual([]);
    scheduled!();
    expect(saved).toEqual([11]);

    store.update((s) => setPreferences(s, { searchRadiusKm: 12 }));
    p.flush();
    expect(saved).toEqual([11, 12]);
    p.stop();
    store.update((s) => setPreferences(s, { searchRadiusKm: 13 }));
    expect(saved).toEqual([11, 12]);
  });
});
