import { describe, expect, it } from 'vitest';
import { createGeocoder } from '../../src/services/geocoding';
import { createHttpClient } from '../../src/services/http';
import { createRateLimiter } from '../../src/services/rateLimit';
import { createRouter } from '../../src/services/routing';
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
