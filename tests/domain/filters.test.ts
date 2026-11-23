import { describe, expect, it } from 'vitest';
import { ROUTE_ONLY_MAX_KM, selectVisibleStations, type VisibilityCriteria } from '../../src/domain/filters';
import type { LatLng } from '../../src/domain/types';
import { branded, prices } from '../state/fixtures';

const HOME: LatLng = [40.4, -3.7];
/** A point `km` kilometres north of HOME. */
const north = (km: number): Pick<ReturnType<typeof branded>, 'lat' | 'lon'> => ({
  lat: 40.4 + km / 111.32,
  lon: -3.7,
});

const criteria = (c: Partial<VisibilityCriteria> = {}): VisibilityCriteria => ({
  fuel: 'GASOLINA_95',
  brands: [],
  ageFilter: { mode: 'all' },
  staleness: {},
  userPosition: HOME,
  route: null,
  searchRadiusKm: 15,
  routeDetourKm: 3,
  routeOnly: false,
  car: null,
  discounts: {},
  sortByTotalCost: false,
  sortByDistance: false,
  ...c,
});

const ids = (r: ReturnType<typeof selectVisibleStations>) => r.rows.map((x) => x.station.id);

describe('selectVisibleStations — filtering', () => {
  const stations = [
    branded('a', { ...north(1), prices: prices({ GASOLINA_95: 1.52 }) }),
    branded('b', { ...north(5), brand: 'CEPSA', prices: prices({ GASOLINA_95: 1.5, GASOLEO_A: 1.4 }) }),
    branded('c', { ...north(20), prices: prices({ GASOLINA_95: 1.4 }) }),
    branded('d', { ...north(2), prices: prices({ GASOLEO_A: 1.3 }) }),
  ];

  it('shows nothing until there is a position', () => {
    expect(ids(selectVisibleStations(stations, criteria({ userPosition: null })))).toEqual([]);
  });

  it('keeps stations within the radius that sell the fuel', () => {
    expect(ids(selectVisibleStations(stations, criteria()))).toEqual(['b', 'a']);
    expect(ids(selectVisibleStations(stations, criteria({ searchRadiusKm: 30 })))).toEqual(['c', 'b', 'a']);
    expect(ids(selectVisibleStations(stations, criteria({ fuel: 'GASOLEO_A' })))).toEqual(['d', 'b']);
  });

  it('applies the brand filter (empty = all)', () => {
    expect(ids(selectVisibleStations(stations, criteria({ brands: ['CEPSA'] })))).toEqual(['b']);
  });

  it('applies the age filter, letting unknown staleness through', () => {
    const staleness = {
      a: { GASOLINA_95: { days: 5, since: 'x', windowDays: 6 } },
      b: { GASOLINA_95: { days: 0, since: 'y', windowDays: 6 } },
    };
    const r = selectVisibleStations(
      stations,
      criteria({ staleness, ageFilter: { mode: 'moreThan', days: 3 }, searchRadiusKm: 30 }),
    );
    expect(ids(r)).toEqual(['c', 'a']); // c has no staleness yet
    expect(r.rows[1]!.staleness).toEqual({ days: 5, since: 'x', windowDays: 6 });
  });

  it('with a route, filters by detour from the route instead of distance from the user', () => {
    const route: LatLng[] = [HOME, [40.4 + 30 / 111.32, -3.7]]; // 30 km due north
    const off = branded('off', {
      lat: 40.5,
      lon: -3.7 + 2 / (111.32 * Math.cos((40.5 * Math.PI) / 180)),
      prices: prices({ GASOLINA_95: 1.3 }),
    });
    const r = selectVisibleStations([...stations, off], criteria({ route, routeDetourKm: 1 }));
    expect(ids(r)).toEqual(['c', 'b', 'a']); // c is 20 km away but on the route; "off" is 2 km off it
    expect(r.rows[0]!.routeDetourKm).toBeCloseTo(0, 6);
    expect(ids(selectVisibleStations([...stations, off], criteria({ route, routeDetourKm: 3 })))).toEqual([
      'off',
      'c',
      'b',
      'a',
    ]);
  });

  it('"only on the route" means within 150 m of the line', () => {
    expect(ROUTE_ONLY_MAX_KM).toBe(0.15);
    const route: LatLng[] = [HOME, [40.6, -3.7]];
    const near = branded('near', {
      lat: 40.45,
      lon: -3.7 + 0.1 / (111.32 * Math.cos((40.45 * Math.PI) / 180)),
    });
    const far = branded('far', {
      lat: 40.45,
      lon: -3.7 + 0.2 / (111.32 * Math.cos((40.45 * Math.PI) / 180)),
    });
    expect(ids(selectVisibleStations([near, far], criteria({ route, routeOnly: true })))).toEqual(['near']);
  });
});

describe('selectVisibleStations — prices, costs and order', () => {
  it('applies brand discounts before sorting', () => {
    const stations = [
      branded('a', { ...north(1), prices: prices({ GASOLINA_95: 1.5 }) }),
      branded('b', { ...north(1), brand: 'CEPSA', prices: prices({ GASOLINA_95: 1.52 }) }),
    ];
    const r = selectVisibleStations(stations, criteria({ discounts: { CEPSA: { type: 'CTS', value: 5 } } }));
    expect(ids(r)).toEqual(['b', 'a']);
    expect(r.rows[0]!.finalPrice).toBe(1.47);
    expect(r.rows[0]!.basePrice).toBe(1.52);
    expect(r.rows[0]!.discount).toEqual({ type: 'CTS', value: 5 });
    expect(r.rows[1]!.discount).toBeNull();
  });

  it('sorts by total cost only when a car is selected and the option is on', () => {
    const car = { tankLitres: 50, consumptionL100km: 6 };
    const stations = [
      branded('near', { ...north(1), prices: prices({ GASOLINA_95: 1.5 }) }),
      branded('far-cheap', { ...north(14), prices: prices({ GASOLINA_95: 1.49 }) }),
    ];
    expect(ids(selectVisibleStations(stations, criteria({ car })))).toEqual(['far-cheap', 'near']);
    expect(ids(selectVisibleStations(stations, criteria({ sortByTotalCost: true })))).toEqual([
      'far-cheap',
      'near',
    ]);
    const byCost = selectVisibleStations(stations, criteria({ car, sortByTotalCost: true }));
    expect(byCost.sortedByTotalCost).toBe(true);
    expect(ids(byCost)).toEqual(['near', 'far-cheap']);
    expect(byCost.rows[0]!.metric).toBe(byCost.rows[0]!.cost.totalCost);
    expect(byCost.rows[0]!.cost.roundTripKm).toBeCloseTo(2, 6);
  });

  it('puts the nearer station first when prices are equal', () => {
    const stations = [branded('far', north(8)), branded('near', north(2)), branded('mid', north(5))];
    expect(ids(selectVisibleStations(stations, criteria()))).toEqual(['near', 'mid', 'far']);
  });

  it('on a route, equal prices go by smaller detour first', () => {
    const route: LatLng[] = [HOME, [40.4 + 30 / 111.32, -3.7]]; // 30 km due north
    const east = (km: number, northKm: number) =>
      branded(`e${km}`, {
        lat: 40.4 + northKm / 111.32,
        lon: -3.7 + km / (111.32 * Math.cos(((40.4 + northKm / 111.32) * Math.PI) / 180)),
      });
    // e2 is nearer the user but farther off the route than e1.
    const stations = [east(2, 1), east(1, 20)];
    expect(ids(selectVisibleStations(stations, criteria({ route, routeDetourKm: 3 })))).toEqual(['e1', 'e2']);
  });

  it('keeps load order for equal prices and equal distances (stable sort)', () => {
    const stations = ['x', 'y', 'z'].map((id) => branded(id, north(1)));
    expect(ids(selectVisibleStations(stations, criteria()))).toEqual(['x', 'y', 'z']);
  });

  it('sorts by distance while colours still follow the price', () => {
    const stations = [
      branded('far-cheap', { ...north(9), prices: prices({ GASOLINA_95: 1.4 }) }),
      branded('near-dear', { ...north(1), prices: prices({ GASOLINA_95: 1.6 }) }),
      branded('mid', { ...north(5), prices: prices({ GASOLINA_95: 1.5 }) }),
    ];
    const r = selectVisibleStations(stations, criteria({ sortByDistance: true }));
    expect(ids(r)).toEqual(['near-dear', 'mid', 'far-cheap']);
    expect(r.sortedByDistance).toBe(true);
    expect(r.rows.map((x) => x.color)).toEqual([
      'hsl(0, 82%, 40%)',
      'hsl(60, 82%, 40%)',
      'hsl(120, 82%, 40%)',
    ]);
  });

  it('by distance, equal distances go cheaper first', () => {
    const stations = [
      branded('dear', { ...north(3), prices: prices({ GASOLINA_95: 1.6 }) }),
      branded('cheap', { ...north(3), prices: prices({ GASOLINA_95: 1.5 }) }),
    ];
    expect(ids(selectVisibleStations(stations, criteria({ sortByDistance: true })))).toEqual([
      'cheap',
      'dear',
    ]);
  });

  it('by distance on a route, the detour is what counts', () => {
    const route: LatLng[] = [HOME, [40.4 + 30 / 111.32, -3.7]];
    const offRoute = branded('off', {
      lat: 40.4 + 1 / 111.32,
      lon: -3.7 + 2 / (111.32 * Math.cos(((40.4 + 1 / 111.32) * Math.PI) / 180)),
    });
    const onRouteFar = branded('on', north(20));
    const r = selectVisibleStations([offRoute, onRouteFar], criteria({ route, sortByDistance: true }));
    expect(ids(r)).toEqual(['on', 'off']);
  });

  it('sorting by distance overrides sorting by total cost', () => {
    const car = { tankLitres: 50, consumptionL100km: 6 };
    const stations = [branded('a', north(4)), branded('b', north(1))];
    const r = selectVisibleStations(stations, criteria({ car, sortByTotalCost: true, sortByDistance: true }));
    expect(r.sortedByTotalCost).toBe(false);
    expect(ids(r)).toEqual(['b', 'a']);
  });

  it('colours the best row green and the worst red', () => {
    const stations = [1.5, 1.6, 1.7].map((p, i) =>
      branded(`s${i}`, { ...north(1), prices: prices({ GASOLINA_95: p }) }),
    );
    expect(selectVisibleStations(stations, criteria()).rows.map((r) => r.color)).toEqual([
      'hsl(120, 82%, 40%)',
      'hsl(60, 82%, 40%)',
      'hsl(0, 82%, 40%)',
    ]);
  });
});

describe('selectVisibleStations — only these ids (favourites)', () => {
  const stations = [
    branded('fav-far', { ...north(200), prices: prices({ GASOLINA_95: 1.6 }) }),
    branded('near', { ...north(1), prices: prices({ GASOLINA_95: 1.4 }) }),
    branded('fav-near', { ...north(3), prices: prices({ GASOLINA_95: 1.5 }) }),
  ];
  const onlyIds = new Set(['fav-far', 'fav-near']);

  it('shows favourites wherever they are and hides the rest', () => {
    const r = selectVisibleStations(stations, criteria({ onlyIds }));
    expect(ids(r)).toEqual(['fav-near', 'fav-far']);
    expect(r.rows[1]!.distanceFromUserKm).toBeCloseTo(200, 0);
  });

  it('works without a position (no distance)', () => {
    const r = selectVisibleStations(stations, criteria({ onlyIds, userPosition: null }));
    expect(ids(r)).toEqual(['fav-near', 'fav-far']);
    expect(r.rows[0]!.distanceFromUserKm).toBeNull();
  });

  it('still applies the fuel and brand filters', () => {
    expect(ids(selectVisibleStations(stations, criteria({ onlyIds, fuel: 'GASOLEO_A' })))).toEqual([]);
    expect(ids(selectVisibleStations(stations, criteria({ onlyIds, brands: ['CEPSA'] })))).toEqual([]);
  });
});
