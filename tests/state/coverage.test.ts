import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '../../src/domain/preferences';
import type { ProvinceShapes } from '../../src/domain/provinceShapes';
import type { LatLng } from '../../src/domain/types';
import { createInitialState, type AppState } from '../../src/state/appState';
import { PROVINCE_MARGIN_KM, provincesNeeded } from '../../src/state/coverage';

const calls: string[] = [];
const shapes: ProvinceShapes = {
  codes: [],
  provinceAt: () => null,
  provincesWithin: (p, km) => (calls.push(`within ${p.join(',')} ${km}`), ['28', '45']),
  provincesAlongRoute: (r, km) => (calls.push(`route ${r.length} ${km}`), ['28', '19', '50']),
};

const state = (patch: Partial<AppState> = {}, prefs: Partial<AppState['preferences']> = {}): AppState => ({
  ...createInitialState({ ...DEFAULT_PREFERENCES, ...prefs }),
  ...patch,
});
const HOME: LatLng = [40, -3.6];

describe('provincesNeeded', () => {
  it('needs nothing without an origin', () => {
    expect(provincesNeeded(state(), shapes)).toEqual([]);
  });

  it('uses the search radius plus a margin around the origin', () => {
    calls.length = 0;
    expect(provincesNeeded(state({ userPosition: HOME }, { searchRadiusKm: 20 }), shapes)).toEqual([
      '28',
      '45',
    ]);
    expect(calls).toEqual([`within 40,-3.6 ${20 + PROVINCE_MARGIN_KM}`]);
  });

  it('with a route, uses the detour (or the "only on route" limit) along it', () => {
    const route: LatLng[] = [HOME, [41, -1]];
    calls.length = 0;
    expect(provincesNeeded(state({ userPosition: HOME, route }, { routeDetourKm: 5 }), shapes)).toEqual([
      '28',
      '19',
      '50',
    ]);
    provincesNeeded(state({ userPosition: HOME, route }, { routeOnly: true }), shapes);
    expect(calls).toEqual([`route 2 ${5 + PROVINCE_MARGIN_KM}`, `route 2 ${0.15 + PROVINCE_MARGIN_KM}`]);
  });

  it("in favourites mode, needs the favourites' provinces only", () => {
    const favourites = [
      { id: 'a', provinceCode: '07', brand: 'X' },
      { id: 'b', provinceCode: '15', brand: 'X' },
      { id: 'c', provinceCode: '07', brand: 'Y' },
    ];
    expect(
      provincesNeeded(state({ userPosition: HOME, favouritesOnly: true }, { favourites }), shapes),
    ).toEqual(['07', '15']);
  });
});
