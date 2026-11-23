import { describe, expect, it } from 'vitest';
import { ROUTE_ONLY_MAX_KM, selectVisibleStations, type VisibilityCriteria } from '../../src/domain/filters';
import { distanceKm } from '../../src/domain/geo';
import {
  isOnRoute,
  ROUTE_CHECK_CANDIDATE_KM,
  routeCheckCandidates,
  routeProbes,
  type RouteChecks,
} from '../../src/domain/routeCheck';
import type { LatLng } from '../../src/domain/types';
import cambre from '../fixtures/route-cambre-a-guarda.json';
import { branded, prices } from '../state/fixtures';

/** A point `km` north of 42°N, 8°W. */
const north = (km: number): LatLng => [42 + km / 111.32, -8];
const straightRoute: LatLng[] = [north(0), north(5), north(10)];

describe('isOnRoute', () => {
  it('not checked (or the check failed): the straight-line rule', () => {
    expect(isOnRoute(0.1, undefined, ROUTE_ONLY_MAX_KM)).toBe(true);
    expect(isOnRoute(0.2, undefined, ROUTE_ONLY_MAX_KM)).toBe(false);
    expect(isOnRoute(0.1, null, ROUTE_ONLY_MAX_KM)).toBe(true);
  });

  it('checked: near the line and at most 1 km of extra driving', () => {
    expect(isOnRoute(0.05, 0.3, ROUTE_ONLY_MAX_KM)).toBe(true);
    expect(isOnRoute(0.25, 1, ROUTE_ONLY_MAX_KM)).toBe(true); // farther than 150 m, but reachable
    expect(isOnRoute(0.05, 2.6, ROUTE_ONLY_MAX_KM)).toBe(false); // street below the motorway
    expect(isOnRoute(0.05, Infinity, ROUTE_ONLY_MAX_KM)).toBe(false);
    expect(isOnRoute(ROUTE_CHECK_CANDIDATE_KM + 0.01, 0, ROUTE_ONLY_MAX_KM)).toBe(false);
  });
});

describe('routeProbes', () => {
  it('takes the route points 2 km before and after where the station meets it', () => {
    const [probe] = routeProbes(straightRoute, [{ id: 'a', position: [north(6)[0], -7.999] }]);
    expect(probe!.id).toBe('a');
    expect(distanceKm(probe!.before, north(4))).toBeLessThan(0.01);
    expect(distanceKm(probe!.after, north(8))).toBeLessThan(0.01);
    expect(probe!.station).toEqual([north(6)[0], -7.999]);
  });

  it('stops at the ends of the route', () => {
    const [start, end] = routeProbes(straightRoute, [
      { id: 's', position: north(0.5) },
      { id: 'e', position: north(9.5) },
    ]);
    expect(distanceKm(start!.before, north(0))).toBeLessThan(0.01);
    expect(distanceKm(start!.after, north(2.5))).toBeLessThan(0.01);
    expect(distanceKm(end!.after, north(10))).toBeLessThan(0.01);
    expect(routeProbes([], [{ id: 'x', position: north(1) }])).toEqual([]);
  });
});

describe('routeCheckCandidates', () => {
  it('lists unchecked stations within 300 m of the route', () => {
    const at = (id: string, eastKm: number) => ({
      id,
      lat: north(3)[0],
      lon: -8 + eastKm / (111.32 * Math.cos((42 * Math.PI) / 180)),
    });
    const stations = [at('near', 0.1), at('edge', 0.29), at('far', 0.4), at('done', 0.1)];
    expect(routeCheckCandidates(stations, straightRoute, { done: 0.2 }).map((c) => c.id)).toEqual([
      'near',
      'edge',
    ]);
  });
});

describe('real route: Cambre → A Guarda (tests/fixtures)', () => {
  const route = cambre.route as unknown as LatLng[];
  const stations = cambre.stations.map((s) =>
    branded(s.id, {
      lat: s.lat,
      lon: s.lon,
      name: s.name,
      address: s.address,
      prices: prices({ GASOLINA_95: 1.5 }),
    }),
  );
  const criteria = (routeChecks?: RouteChecks): VisibilityCriteria => ({
    fuel: 'GASOLINA_95',
    brands: [],
    ageFilter: { mode: 'all' },
    staleness: {},
    userPosition: cambre.origin as unknown as LatLng,
    route,
    searchRadiusKm: 15,
    routeDetourKm: 3,
    routeOnly: true,
    routeChecks,
    car: null,
    discounts: {},
    sortByTotalCost: false,
    sortByDistance: false,
  });
  const ids = (checks?: RouteChecks) =>
    new Set(selectVisibleStations(stations, criteria(checks)).rows.map((r) => r.station.id));
  const checks = cambre.extraKm as RouteChecks;

  // Opposite-direction service areas, and stations on streets or estates beside the motorway.
  const offRoute = ['813', '557', '356', '701', '15073', '789', '16462'];
  const onRoute = ['787', '8496', '8497', '326', '558', '786', '669', '668', '814'];

  it('the straight-line rule alone lets in stations that need leaving the road', () => {
    const before = ids();
    expect(before.size).toBe(16);
    for (const id of offRoute) expect(before.has(id)).toBe(true);
  });

  it('with the road checks, only the stations really on the way remain', () => {
    expect([...ids(checks)].sort()).toEqual([...onRoute].sort());
  });

  it('every station within 300 m is a candidate, with probes about 2 km either side', () => {
    const candidates = routeCheckCandidates(stations, route, {});
    expect(candidates.map((c) => c.id).sort()).toEqual(Object.keys(checks).sort());
    for (const p of routeProbes(route, candidates)) {
      const span = distanceKm(p.before, p.after);
      expect(span).toBeGreaterThan(2); // straight line between points 4 km apart along a winding road
      expect(span).toBeLessThanOrEqual(4.01);
    }
  });
});
