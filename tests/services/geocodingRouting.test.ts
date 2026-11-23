import { describe, expect, it } from 'vitest';
import { createGeocoder } from '../../src/services/geocoding';
import { createHttpClient } from '../../src/services/http';
import { createRateLimiter } from '../../src/services/rateLimit';
import { createRouter, TABLE_BATCH } from '../../src/services/routing';
import type { RouteProbe } from '../../src/domain/routeCheck';
import { fakeFetch } from '../helpers';
import realSearch from '../fixtures/nominatim-search.json';
import realReverse from '../fixtures/nominatim-reverse.json';
import realRoute from '../fixtures/osrm-route.json';

/** A fake clock whose sleep() advances time instantly. */
const fakeClock = () => {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => (t += ms),
    sleeps,
  };
};

describe('createRateLimiter', () => {
  it('spaces task starts at least minInterval apart, in order', async () => {
    const clock = fakeClock();
    const limit = createRateLimiter(1000, clock);
    const starts: number[] = [];
    await Promise.all([1, 2, 3].map((n) => limit(async () => starts.push(clock.now()) && n)));
    expect(starts).toEqual([0, 1000, 2000]);
  });

  it('does not wait when enough time has passed', async () => {
    const clock = fakeClock();
    const limit = createRateLimiter(1000, clock);
    await limit(async () => 1);
    clock.advance(5000);
    await limit(async () => 2);
    expect(clock.sleeps).toEqual([]);
  });

  it('keeps going after a failed task', async () => {
    const clock = fakeClock();
    const limit = createRateLimiter(1000, clock);
    const failed = limit(async () => {
      throw new Error('boom');
    });
    const next = limit(async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    expect(await next).toBe('ok');
  });
});

describe('createGeocoder', () => {
  const setup = (routes: Parameters<typeof fakeFetch>[0]) => {
    const fetchFn = fakeFetch(routes);
    const clock = fakeClock();
    const geocoder = createGeocoder({
      http: createHttpClient({ fetchFn }),
      limiter: createRateLimiter(1000, clock),
    });
    return { geocoder, fetchFn, clock };
  };

  it('returns the first match with its province, and caches it', async () => {
    const { geocoder, fetchFn } = setup({
      '/search': [{ lat: '40.4168', lon: '-3.7038', address: { postcode: '28013' } }],
    });
    expect(await geocoder.search('Puerta del Sol, Madrid')).toEqual({
      latLng: [40.4168, -3.7038],
      provinceCode: '28',
    });
    expect(fetchFn.calls[0]!.url).toContain('q=Puerta%20del%20Sol%2C%20Madrid');
    await geocoder.search('  puerta del sol, madrid ');
    expect(fetchFn.calls).toHaveLength(1);
  });

  it('returns null when nothing is found', async () => {
    const { geocoder } = setup({ '/search': [] });
    expect(await geocoder.search('zzzz')).toBeNull();
  });

  it('reverse-geocodes to a province code, caching nearby positions', async () => {
    const { geocoder, fetchFn } = setup({ '/reverse': { address: { state: 'Comunidad de Madrid' } } });
    expect(await geocoder.reverseProvince([40.41681, -3.70381])).toBe('28');
    expect(await geocoder.reverseProvince([40.41684, -3.70379])).toBe('28');
    expect(fetchFn.calls).toHaveLength(1);
    expect(fetchFn.calls[0]!.url).toContain('&lat=40.41681&lon=-3.70381');
  });

  it('keeps Nominatim requests at least 1 s apart', async () => {
    const { geocoder, clock } = setup({ '/search': [], '/reverse': { address: {} } });
    await Promise.all([geocoder.search('a'), geocoder.search('b'), geocoder.reverseProvince([1, 1])]);
    expect(clock.sleeps).toEqual([1000, 1000]);
  });

  it('does not cache failures', async () => {
    let fail = true;
    const { geocoder } = setup({
      '/search': () => (fail ? new Response('busy', { status: 429 }) : new Response('[]')),
    });
    await expect(geocoder.search('x')).rejects.toThrow('HTTP 429');
    fail = false;
    expect(await geocoder.search('x')).toBeNull();
  });
});

describe('createRouter', () => {
  it('returns the route as [lat, lon] points', async () => {
    const fetchFn = fakeFetch({
      'router.project-osrm.org': {
        code: 'Ok',
        routes: [
          {
            geometry: {
              coordinates: [
                [-3.7, 40.4],
                [-3.75, 40.35],
              ],
            },
          },
        ],
      },
    });
    const router = createRouter({ http: createHttpClient({ fetchFn }) });
    expect(await router.route([40.4, -3.7], [40.35, -3.75])).toEqual([
      [40.4, -3.7],
      [40.35, -3.75],
    ]);
    expect(fetchFn.calls[0]!.url).toContain(
      '/driving/-3.7,40.4;-3.75,40.35?overview=full&geometries=geojson',
    );
  });

  it('returns null when OSRM finds no route (even with a 4xx status)', async () => {
    const fetchFn = fakeFetch({
      'router.project-osrm.org': () => new Response('{"code":"NoRoute"}', { status: 400 }),
    });
    const router = createRouter({ http: createHttpClient({ fetchFn }) });
    expect(await router.route([40.4, -3.7], [28.1, -15.4])).toBeNull();
  });
});

describe('createRouter: extra distance through stations (OSRM table)', () => {
  const probe = (k: number): RouteProbe => ({
    id: `s${k}`,
    before: [42, -8 - k],
    station: [42.01, -8.001 - k],
    after: [42.02, -8 - k],
  });

  it('asks before/station → station/after and returns the extra km', async () => {
    // Probe 0: 2.0 + 2.1 − 4.0 = 0.1 km. Probe 1: the station can't be reached.
    const fetchFn = fakeFetch({
      '/table/v1/driving/': {
        code: 'Ok',
        distances: [
          [2000, 4000, 0, 0],
          [0, 2100, 0, 0],
          [0, 0, null, 4000],
          [0, 0, 0, 1500],
        ],
      },
    });
    const router = createRouter({ http: createHttpClient({ fetchFn }) });
    expect(await router.extraDistances([probe(0), probe(1)])).toEqual([0.1, Infinity]);
    const url = fetchFn.calls[0]!.url;
    expect(url).toContain('/table/v1/driving/-8,42;-8.001,42.01;-8,42.02;-9,42;-9.001,42.01;-9,42.02?');
    expect(url).toContain('sources=0;1;3;4&destinations=1;2;4;5&annotations=distance');
  });

  it('splits many stations into several requests, one after another', async () => {
    const fetchFn = fakeFetch({
      '/table/v1/driving/': (url: string) => {
        const n = new URL(url).searchParams.get('sources')!.split(';').length;
        const distances = Array.from({ length: n }, (_, r) =>
          Array.from({ length: n }, (_, c) => (r % 2 === 0 && c % 2 === 1 ? 1000 : 600)),
        );
        return new Response(JSON.stringify({ code: 'Ok', distances }));
      },
    });
    const router = createRouter({ http: createHttpClient({ fetchFn }) });
    const out = await router.extraDistances(Array.from({ length: TABLE_BATCH + 1 }, (_, k) => probe(k)));
    expect(fetchFn.calls).toHaveLength(2);
    expect(out).toHaveLength(TABLE_BATCH + 1);
    expect(out.every((x) => Math.abs(x - 0.2) < 1e-9)).toBe(true); // 600 + 600 − 1000 m
  });

  it('throws when OSRM answers with an error', async () => {
    const fetchFn = fakeFetch({
      '/table/v1/driving/': () => new Response('{"code":"TooBig"}', { status: 400 }),
    });
    const router = createRouter({ http: createHttpClient({ fetchFn }) });
    await expect(router.extraDistances([probe(0)])).rejects.toThrow();
    expect(await router.extraDistances([])).toEqual([]);
  });
});

describe('real Nominatim / OSRM responses (tests/fixtures)', () => {
  it('geocodes Puerta del Sol to Madrid (28) and reverse-geocodes it back', async () => {
    const fetchFn = fakeFetch({ '/search': realSearch, '/reverse': realReverse });
    const geocoder = createGeocoder({ http: createHttpClient({ fetchFn }), limiter: createRateLimiter(0) });
    const place = await geocoder.search('Puerta del Sol, Madrid');
    expect(place!.provinceCode).toBe('28');
    expect(place!.latLng[0]).toBeCloseTo(40.4169, 3);
    expect(await geocoder.reverseProvince(place!.latLng)).toBe('28');
  });

  it('turns a real OSRM route into [lat, lon] points', async () => {
    const fetchFn = fakeFetch({ 'router.project-osrm.org': realRoute });
    const points = await createRouter({ http: createHttpClient({ fetchFn }) }).route(
      [40.4168, -3.7038],
      [40.4067, -3.711],
    );
    expect(points).toHaveLength(realRoute.routes[0]!.geometry.coordinates.length);
    expect(points![0]![0]).toBeGreaterThan(40); // latitude first
  });
});
