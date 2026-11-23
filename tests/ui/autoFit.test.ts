import { describe, expect, it } from 'vitest';
import type { LatLng } from '../../src/domain/types';
import { createVisibleStationsSelector } from '../../src/state/selectors';
import {
  finishHistoryJob,
  setFavouritesOnly,
  setFuel,
  setPreferences,
  setRoute,
  setUserPosition,
  startHistoryJob,
} from '../../src/state/transitions';
import { createAutoFit } from '../../src/ui/autoFit';
import { prices, state, station } from '../state/fixtures';

const HOME: LatLng = [40.4, -3.7];
const stations = [1.55, 1.5, 1.6, 1.45, 1.7].map((p, i) => ({
  ...station(`s${i}`, { lat: 40.4 + (i + 1) * 0.01, prices: prices({ GASOLINA_95: p, GASOLEO_A: 1.4 }) }),
  brand: 'REPSOL',
}));

function setup() {
  const fits: LatLng[][] = [];
  const autoFit = createAutoFit((points) => void fits.push(points));
  const select = createVisibleStationsSelector();
  const render = (s: ReturnType<typeof state>) => autoFit.update(s, select(s));
  return { fits, render };
}

describe('createAutoFit', () => {
  it('a new origin fits the origin and the 3 cheapest, once results exist', () => {
    const { fits, render } = setup();
    const noStations = setUserPosition(state(), HOME);
    render(noStations); // province still loading
    expect(fits).toEqual([]);
    const loaded = { ...noStations, stations };
    render(loaded);
    expect(fits).toEqual([[HOME, [40.44, -3.7], [40.42, -3.7], [40.41, -3.7]]]);

    // Background updates (a history check) don't move the map.
    const checking = startHistoryJob(loaded, 1, { province: '28', days: 3 });
    render(checking);
    render(finishHistoryJob(checking, 1, {}));
    expect(fits).toHaveLength(1);
  });

  it('a user change fits again; the 3 cheapest even when sorted by distance', () => {
    const { fits, render } = setup();
    const s = { ...setUserPosition(state(), HOME), stations };
    render(s);
    render(setFuel(s, 'GASOLEO_A'));
    expect(fits).toHaveLength(2);
    render(setPreferences(s, { sortByDistance: true }));
    expect(fits[2]).toEqual([HOME, [40.44, -3.7], [40.42, -3.7], [40.41, -3.7]]);
  });

  it('with a route nothing moves; favourites mode fits the favourites only', () => {
    const { fits, render } = setup();
    const s = {
      ...setUserPosition(state({ favourites: [{ id: 's4', provinceCode: '28', brand: 'X' }] }), HOME),
      stations,
    };
    const routed = setRoute(s, [HOME, [41, -3.7]]);
    render(routed);
    render(setFuel(routed, 'GASOLEO_A'));
    expect(fits).toEqual([]);
    render(setFavouritesOnly(routed, true));
    expect(fits).toHaveLength(1);
    expect(fits[0]).toHaveLength(1);
    expect(fits[0]![0]![0]).toBeCloseTo(40.45, 9);
  });
});
