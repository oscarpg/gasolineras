import { describe, expect, it } from 'vitest';
import type { RouteProbe } from '../../src/domain/routeCheck';
import type { LatLng } from '../../src/domain/types';
import { watchRouteChecks } from '../../src/state/routeChecks';
import { createStore } from '../../src/state/store';
import { addStations, setPreferences, setRoute } from '../../src/state/transitions';
import { state, station } from './fixtures';

const flush = () => new Promise((r) => setTimeout(r, 0));
/** A point `km` north of 42°N, 8°W, and one 100 m east of it. */
const north = (km: number): LatLng => [42 + km / 111.32, -8];
const beside = (km: number) => ({
  lat: north(km)[0],
  lon: -8 + 0.1 / (111.32 * Math.cos((42 * Math.PI) / 180)),
});
const ROUTE: LatLng[] = [north(0), north(20)];

/** A router that answers `extra(id)` for each probe, recording what it was asked. */
function fakeRouter(extra: (id: string) => number = () => 0.2, fail = false) {
  const asked: string[][] = [];
  return {
    asked,
    async extraDistances(probes: readonly RouteProbe[]) {
      asked.push(probes.map((p) => p.id));
      if (fail) throw new Error('offline');
      return probes.map((p) => extra(p.id));
    },
  };
}

function setup(router = fakeRouter()) {
  const store = createStore(
    addStations(state({ routeOnly: true }), [
      station('a', beside(5)),
      station('far', { lat: north(5)[0], lon: -7.9 }),
    ]),
  );
  const stop = watchRouteChecks({ store, router });
  return { store, router, stop };
}

describe('watchRouteChecks', () => {
  it('checks the stations near a new route once, and stores the results', async () => {
    const { store, router } = setup(fakeRouter((id) => (id === 'a' ? 0.4 : 9)));
    store.update((s) => setRoute(s, ROUTE));
    await flush();
    expect(router.asked).toEqual([['a']]); // "far" is 8 km away from the route
    expect(store.getState().routeChecks).toEqual({ a: 0.4 });

    store.update((s) => setPreferences(s, { fuel: 'GLP' })); // nothing new to check
    await flush();
    expect(router.asked).toHaveLength(1);
  });

  it('checks stations that arrive later (provinces along the route load one by one)', async () => {
    const { store, router } = setup();
    store.update((s) => setRoute(s, ROUTE));
    await flush();
    store.update((s) => addStations(s, [station('b', beside(15))]));
    await flush();
    expect(router.asked).toEqual([['a'], ['b']]);
    expect(Object.keys(store.getState().routeChecks).sort()).toEqual(['a', 'b']);
  });

  it('does nothing until "only on the route" is on, and checks again for a new route', async () => {
    const { store, router } = setup();
    store.update((s) => setRoute(setPreferences(s, { routeOnly: false }), ROUTE));
    await flush();
    expect(router.asked).toEqual([]);
    store.update((s) => setPreferences(s, { routeOnly: true }));
    await flush();
    expect(router.asked).toEqual([['a']]);
    store.update((s) => setRoute(s, [north(1), north(19)]));
    await flush();
    expect(router.asked).toEqual([['a'], ['a']]);
  });

  it('when the router fails, stores null (the straight-line rule applies) and does not retry', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const { store, router } = setup(fakeRouter(undefined, true));
      store.update((s) => setRoute(s, ROUTE));
      await flush();
      expect(store.getState().routeChecks).toEqual({ a: null });
      store.update((s) => setPreferences(s, { fuel: 'GLP' }));
      await flush();
      expect(router.asked).toHaveLength(1);
    } finally {
      console.warn = warn;
    }
  });

  it('stops watching', async () => {
    const { store, router, stop } = setup();
    stop();
    store.update((s) => setRoute(s, ROUTE));
    await flush();
    expect(router.asked).toEqual([]);
  });
});
