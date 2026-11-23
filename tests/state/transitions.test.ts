import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/state/appState';
import { DEFAULT_PREFERENCES } from '../../src/domain/preferences';
import {
  addStations,
  clearFilters,
  deleteCar,
  finishHistoryJob,
  markProvinceLoaded,
  removeDiscount,
  resetHistoryDepth,
  saveCar,
  selectCar,
  setAllBrands,
  setBrandSelected,
  setCustomAgeDays,
  setDiscount,
  setFavouritesOnly,
  setFuel,
  startHistoryJob,
  toggleFavourite,
  widenSearch,
} from '../../src/state/transitions';
import { LEON, VAN, branded, prices, state, station } from './fixtures';

describe('createInitialState', () => {
  it('activates the first car when none is active, and uses the active car’s fuel', () => {
    const s = createInitialState({ ...DEFAULT_PREFERENCES, fuel: 'GLP', cars: [VAN, LEON] });
    expect(s.preferences.activeCarId).toBe('c2');
    expect(s.preferences.fuel).toBe('GASOLEO_A');
  });

  it('keeps the saved fuel when the active car no longer exists', () => {
    const s = createInitialState({ ...DEFAULT_PREFERENCES, fuel: 'GLP', cars: [LEON], activeCarId: 'gone' });
    expect(s.preferences.activeCarId).toBe('gone');
    expect(s.preferences.fuel).toBe('GLP');
  });
});

describe('fuel and cars', () => {
  it('changing to another fuel deactivates the active car; the same fuel keeps it', () => {
    const s = state({ cars: [LEON], activeCarId: 'c1' });
    expect(setFuel(s, 'GASOLINA_95').preferences.activeCarId).toBe('c1');
    const changed = setFuel(s, 'GASOLEO_A');
    expect(changed.preferences.activeCarId).toBeNull();
    expect(changed.preferences.fuel).toBe('GASOLEO_A');
  });

  it('selecting a car switches to its fuel', () => {
    const s = selectCar(state({ cars: [LEON, VAN], activeCarId: 'c1' }), 'c2');
    expect(s.preferences.activeCarId).toBe('c2');
    expect(s.preferences.fuel).toBe('GASOLEO_A');
  });

  it('saving a new car adds and activates it', () => {
    const s = saveCar(
      state({ cars: [LEON] }),
      { name: 'Moto', fuel: 'GASOLINA_98', tankLitres: 15, consumptionL100km: 4 },
      'c9',
    );
    expect(s.preferences.cars.map((c) => c.id)).toEqual(['c1', 'c9']);
    expect(s.preferences.activeCarId).toBe('c9');
    expect(s.preferences.fuel).toBe('GASOLINA_98');
  });

  it('saving with an existing name (any case) updates that car in place', () => {
    const s = saveCar(
      state({ cars: [LEON, VAN], activeCarId: 'c2' }),
      { name: 'LEÓN', fuel: 'GLP', tankLitres: 45, consumptionL100km: 7 },
      'unused',
    );
    expect(s.preferences.cars).toEqual([{ ...LEON, fuel: 'GLP', tankLitres: 45, consumptionL100km: 7 }, VAN]);
    expect(s.preferences.activeCarId).toBe('c1');
  });

  it('deleting the active car activates the next one with its fuel', () => {
    const s = deleteCar(state({ cars: [LEON, VAN], activeCarId: 'c1' }), 'c1');
    expect(s.preferences.cars).toEqual([VAN]);
    expect(s.preferences.activeCarId).toBe('c2');
    expect(s.preferences.fuel).toBe('GASOLEO_A');
    const empty = deleteCar(s, 'c2');
    expect(empty.preferences.activeCarId).toBeNull();
    expect(empty.preferences.fuel).toBe('GASOLEO_A');
  });

  it('deleting another car leaves the active one alone', () => {
    const s = deleteCar(state({ cars: [LEON, VAN], activeCarId: 'c1' }), 'c2');
    expect(s.preferences.activeCarId).toBe('c1');
  });
});

describe('filters', () => {
  it('clamps the custom age days to 1–10', () => {
    expect(setCustomAgeDays(state(), 50).preferences.ageFilterCustomDays).toBe(10);
    expect(setCustomAgeDays(state(), 0).preferences.ageFilterCustomDays).toBe(3);
    expect(setCustomAgeDays(state(), -2).preferences.ageFilterCustomDays).toBe(1);
    expect(setCustomAgeDays(state(), 6).preferences.ageFilterCustomDays).toBe(6);
  });

  it('adds and removes discounts without touching others', () => {
    const s = setDiscount(state({ discounts: { A: { type: 'CTS', value: 1 } } }), 'B', {
      type: 'PCT',
      value: 3,
    });
    expect(Object.keys(s.preferences.discounts)).toEqual(['A', 'B']);
    expect(removeDiscount(s, 'A').preferences.discounts).toEqual({ B: { type: 'PCT', value: 3 } });
  });

  it('"all brands" clears the filter; unticking it selects every brand', () => {
    expect(setAllBrands(state({ brands: ['X'] }), true, ['X', 'Y']).preferences.brands).toEqual([]);
    expect(setAllBrands(state(), false, ['X', 'Y']).preferences.brands).toEqual(['X', 'Y']);
  });

  it('toggles single brands', () => {
    const s = setBrandSelected(state({ brands: ['X', 'Y'] }), 'X', false);
    expect(s.preferences.brands).toEqual(['Y']);
    expect(setBrandSelected(s, 'Z', true).preferences.brands).toEqual(['Y', 'Z']);
  });
});

describe('no results: widen and clear filters', () => {
  it('widening adds 10 km, at most 50', () => {
    expect(widenSearch(state({ searchRadiusKm: 15 })).preferences.searchRadiusKm).toBe(25);
    expect(widenSearch(state({ searchRadiusKm: 45 })).preferences.searchRadiusKm).toBe(50);
    expect(widenSearch(state({ searchRadiusKm: 50 })).preferences.searchRadiusKm).toBe(50);
  });

  it('clearing filters resets the price age and brands only', () => {
    const s = state({ ageFilterOption: 'moreThan3', brands: ['CEPSA'], searchRadiusKm: 30, fuel: 'GLP' });
    expect(clearFilters(s).preferences).toEqual({ ...s.preferences, ageFilterOption: 'all', brands: [] });
  });
});

describe('favourites', () => {
  it('toggling adds the station with its province and brand, then removes it', () => {
    const st = branded('s1', { provinceCode: '07', brand: 'CEPSA' });
    const added = toggleFavourite(state(), st);
    expect(added.preferences.favourites).toEqual([{ id: 's1', provinceCode: '07', brand: 'CEPSA' }]);
    expect(toggleFavourite(added, st).preferences.favourites).toEqual([]);
  });

  it('removing one keeps the others in order', () => {
    const s = [branded('a'), branded('b'), branded('c')].reduce(toggleFavourite, state());
    expect(toggleFavourite(s, branded('b')).preferences.favourites.map((f) => f.id)).toEqual(['a', 'c']);
  });

  it('favourites mode is a flag outside the preferences', () => {
    const s = state();
    const on = setFavouritesOnly(s, true);
    expect(on.favouritesOnly).toBe(true);
    expect(on.preferences).toBe(s.preferences);
    expect(setFavouritesOnly(on, true)).toBe(on);
    expect(setFavouritesOnly(on, false).favouritesOnly).toBe(false);
  });
});

describe('addStations', () => {
  it('adds stations with their brand, skipping ids already loaded', () => {
    const s = addStations(state(), [station('1', { name: 'E.S. CEPSA CENTRO' }), station('2'), station('1')]);
    expect(s.stations.map((x) => [x.id, x.brand])).toEqual([
      ['1', 'CEPSA'],
      ['2', 'REPSOL'],
    ]);
    const again = addStations(s, [station('2', { prices: prices({ GASOLINA_95: 9 }) })]);
    expect(again.stations[1]!.prices.GASOLINA_95).toBe(1.5);
  });

  it('replaces existing stations when refreshing', () => {
    const s = addStations(state(), [station('1'), station('2')]);
    const refreshed = addStations(s, [station('2', { prices: prices({ GASOLINA_95: 1.42 }) })], {
      replace: true,
    });
    expect(refreshed.stations.map((x) => x.prices.GASOLINA_95)).toEqual([1.5, 1.42]);
  });

  it('drops brand-filter entries for brands no station has, normalising them first', () => {
    const s = addStations(state({ brands: ['repsol', 'SHELL'] }), [station('1')]);
    expect(s.preferences.brands).toEqual(['REPSOL']);
  });

  it('keeps the same preferences object when the brand filter is unchanged', () => {
    const s0 = state({ brands: ['REPSOL'] });
    expect(addStations(s0, [station('1')]).preferences).toBe(s0.preferences);
  });

  it('marks provinces loaded once', () => {
    const s = markProvinceLoaded(markProvinceLoaded(state(), '28'), '28');
    expect(s.loadedProvinces).toEqual(['28']);
  });
});

describe('history jobs', () => {
  const result = (days: number) => ({ A: { GASOLINA_95: { days, since: 'x', windowDays: days } } });

  it('shows loading while running, then done with the job’s depth', () => {
    let s = startHistoryJob(state(), 1, { province: '28', days: 4 });
    expect(s.historyStatus).toEqual({ status: 'loading', days: 4 });
    s = finishHistoryJob(s, 1, result(4));
    expect(s.historyStatus).toEqual({ status: 'done', days: 4 });
    expect(s.historyDepth).toEqual({ '28': 4 });
    expect(s.staleness.A!.GASOLINA_95!.days).toBe(4);
    expect(s.historyJobs).toEqual({});
  });

  it('keeps showing loading while another job is still running', () => {
    let s = startHistoryJob(state(), 1, { province: '28', days: 4 });
    s = startHistoryJob(s, 2, { province: '46', days: 4 });
    s = finishHistoryJob(s, 1, result(4));
    expect(s.historyStatus?.status).toBe('loading');
    s = finishHistoryJob(s, 2, {});
    expect(s.historyStatus?.status).toBe('done');
  });

  it('ignores a shorter check that finishes after a longer one', () => {
    let s = startHistoryJob(state(), 1, { province: '28', days: 4 });
    s = startHistoryJob(s, 2, { province: '28', days: 7 });
    s = finishHistoryJob(s, 2, result(7));
    s = finishHistoryJob(s, 1, result(4));
    expect(s.historyDepth['28']).toBe(7);
    expect(s.staleness.A!.GASOLINA_95!.windowDays).toBe(7);
  });

  it('reports errors without changing staleness, and resetHistoryDepth allows rechecks', () => {
    let s = startHistoryJob(state(), 1, { province: '28', days: 4 });
    s = finishHistoryJob(s, 1, null);
    expect(s.historyStatus).toEqual({ status: 'error', days: 4 });
    expect(s.historyDepth).toEqual({});
    s = resetHistoryDepth({ ...s, historyDepth: { '28': 7 } });
    expect(s.historyDepth).toEqual({});
  });

  it('ignores unknown job ids', () => {
    const s = state();
    expect(finishHistoryJob(s, 99, {})).toBe(s);
  });
});
