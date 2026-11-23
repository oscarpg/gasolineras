import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/domain/errors';
import { DEFAULT_PREFERENCES } from '../../src/domain/preferences';
import type { ProvinceShapes } from '../../src/domain/provinceShapes';
import type { LatLng } from '../../src/domain/types';
import type { GeoProvider } from '../../src/platform/geolocation';
import type { Geocoder, GeocodeResult } from '../../src/services/geocoding';
import type { Router } from '../../src/services/routing';
import { createInitialState } from '../../src/state/appState';
import type { Effects } from '../../src/state/effects';
import { createStore } from '../../src/state/store';
import { markProvinceLoaded, setPreferences } from '../../src/state/transitions';
import { i18n } from '../../src/ui/i18nContext';
import { createLocationController } from '../../src/ui/locationController';
import { flush, recordingMapView, recordingStatus } from './fakes';

const t = (...args: Parameters<ReturnType<typeof i18n>['t']>) => i18n().t(...args);
const MADRID: LatLng = [40.42, -3.7];
const GETAFE: GeocodeResult = { latLng: [40.3, -3.73], provinceCode: '28' };

interface Options {
  gps?: Partial<GeoProvider>;
  search?: Geocoder['search'];
  reverse?: Geocoder['reverseProvince'];
  route?: Router['route'];
  loadFailures?: number;
  cached?: boolean;
  /** Fake outlines (default: they know no province). `null` = they fail to load. */
  shapes?: Partial<ProvinceShapes> | null;
  /** Provinces whose download always fails. */
  failing?: string[];
}

const fakeShapes = (s: Partial<ProvinceShapes> = {}): ProvinceShapes => ({
  codes: [],
  provinceAt: () => null,
  provincesWithin: () => [],
  provincesAlongRoute: () => [],
  ...s,
});

function setup(o: Options = {}) {
  const store = createStore(createInitialState(DEFAULT_PREFERENCES));
  const loads: { code: string; force: boolean }[] = [];
  let failuresLeft = o.loadFailures ?? 0;
  const effects: Effects = {
    async loadProvince(code, { force = false } = {}) {
      loads.push({ code, force });
      if (failuresLeft-- > 0 || o.failing?.includes(code)) throw new AppError('download-failed');
      store.update((s) => markProvinceLoaded(s, code));
    },
    checkHistory: async () => {},
    ensureHistoryForFilter: async () => {},
  };
  const status = recordingStatus();
  const map = recordingMapView();
  let rerenders = 0;
  const controller = createLocationController({
    store,
    effects,
    miteco: { hasCachedProvince: () => o.cached ?? false },
    geocoder: {
      search: o.search ?? (async () => GETAFE),
      reverseProvince: o.reverse ?? (async () => '28'),
    },
    router: { route: o.route ?? (async (from, to) => [from, to]) },
    gps: { isAvailable: () => true, getCurrentPosition: async () => MADRID, ...o.gps },
    mapView: map.view,
    status: status.status,
    provinceShapes: async () => {
      if (o.shapes === null) throw new Error('chunk failed');
      return fakeShapes(o.shapes);
    },
    rerender: () => void rerenders++,
  });
  return { controller, store, loads, status, map, rerenders: () => rerenders };
}

describe('createLocationController', () => {
  it('start(): locates, finds the province, loads it and re-renders', async () => {
    const { controller, store, loads, status, map, rerenders } = setup();
    controller.start();
    await flush();
    expect(status.shown).toEqual([
      t('message.locating'),
      t('message.findingProvince'),
      t('message.downloadingProvince', { code: '28' }),
    ]);
    expect(map.calls).toEqual(['user 40.42,-3.7 z13']);
    expect(store.getState().userPosition).toEqual(MADRID);
    expect(loads).toEqual([{ code: '28', force: false }]);
    expect(rerenders()).toBe(1);
    expect(status.errors).toEqual([]);
  });

  it('start(): explains what to do when there is no geolocation or no permission', async () => {
    const none = setup({ gps: { isAvailable: () => false } });
    none.controller.start();
    expect(none.status.last()).toBe(t('message.noGeolocation'));

    const denied = setup({
      gps: { getCurrentPosition: () => Promise.reject(new AppError('geolocation-denied')) },
    });
    denied.controller.start();
    await flush();
    expect(denied.status.last()).toBe(t('message.noLocationYet'));
    expect(denied.status.errors).toEqual([]);
  });

  it('does not download a province that is already loaded, nor announce a cached one', async () => {
    const { controller, store, loads, status } = setup({ cached: true });
    controller.start();
    await flush();
    expect(status.shown).not.toContain(t('message.downloadingProvince', { code: '28' }));
    expect(loads).toHaveLength(1);
    expect(store.getState().loadedProvinces).toEqual(['28']);
    controller.requestGps();
    await flush();
    expect(loads).toHaveLength(1);
  });

  it('province download failure: error with Retry; Retry downloads again and re-renders', async () => {
    const { controller, loads, status, rerenders } = setup({ loadFailures: 1 });
    controller.start();
    await flush();
    expect(status.errors).toHaveLength(1);
    expect(status.errors[0]!.message).toBe(
      t('message.provinceError', { message: t('errors.download-failed') }),
    );
    expect(rerenders()).toBe(1); // status line back to the summary

    status.errors[0]!.retry!();
    await flush();
    expect(loads).toEqual([
      { code: '28', force: false },
      { code: '28', force: false },
    ]);
    expect(status.errors).toHaveLength(1);
    expect(rerenders()).toBe(2);
  });

  it('unknown province: error with Retry that tries the same position again', async () => {
    const answers: (string | null)[] = [null, '28'];
    const { controller, loads, status } = setup({ reverse: async () => answers.shift() ?? null });
    controller.start();
    await flush();
    expect(status.errors.map((e) => e.message)).toEqual([t('message.provinceUnknown')]);
    status.errors[0]!.retry!();
    await flush();
    expect(loads).toEqual([{ code: '28', force: false }]);
  });

  it('reverse geocoding errors count as an unknown province', async () => {
    const { controller, status } = setup({ reverse: () => Promise.reject(new Error('offline')) });
    controller.start();
    await flush();
    expect(status.errors.map((e) => e.message)).toEqual([t('message.provinceUnknown')]);
  });

  it('requestGps(): GPS error with Retry; status line goes back to "waiting" when there is no origin', async () => {
    let fail = true;
    const { controller, status, store } = setup({
      gps: {
        getCurrentPosition: () =>
          fail ? Promise.reject(new AppError('geolocation-denied')) : Promise.resolve(MADRID),
      },
    });
    controller.requestGps();
    await flush();
    expect(status.errors[0]!.message).toBe(
      t('message.gpsError', { message: t('errors.geolocation-denied') }),
    );
    expect(status.last()).toBe(t('results.waiting'));
    fail = false;
    status.errors[0]!.retry!();
    await flush();
    expect(store.getState().userPosition).toEqual(MADRID);
    expect(status.cleared()).toBeGreaterThan(0);
  });

  it('searchAddress(): success moves the origin; not found and errors are reported', async () => {
    const ok = setup();
    expect(await ok.controller.searchAddress('Getafe')).toBe(true);
    expect(ok.store.getState().userPosition).toEqual(GETAFE.latLng);
    expect(ok.status.shown).not.toContain(t('message.findingProvince')); // province came with the result

    const notFound = setup({ search: async () => null });
    expect(await notFound.controller.searchAddress('nowhere')).toBe(false);
    expect(notFound.status.errors).toEqual([{ message: t('message.addressNotFound'), retry: undefined }]);

    let fail = true;
    const failing = setup({ search: async () => (fail ? Promise.reject(new AppError('timeout')) : GETAFE) });
    expect(await failing.controller.searchAddress('Getafe')).toBe(false);
    expect(failing.status.errors[0]!.message).toBe(
      t('message.genericError', { message: t('errors.timeout') }),
    );
    fail = false;
    failing.status.errors[0]!.retry!();
    await flush();
    await flush();
    expect(failing.store.getState().userPosition).toEqual(GETAFE.latLng);
  });

  it('calculateRoute(): needs an origin, draws the route, loads the destination province', async () => {
    const noOrigin = setup();
    expect(await noOrigin.controller.calculateRoute('Getafe')).toBe(false);
    expect(noOrigin.status.errors[0]!.message).toBe(t('message.originFirst'));

    const { controller, store, map, loads } = setup({
      search: async () => ({ ...GETAFE, provinceCode: '45' }),
    });
    controller.start();
    await flush();
    expect(await controller.calculateRoute('Toledo')).toBe(true);
    expect(loads.map((l) => l.code)).toEqual(['28', '45']);
    expect(map.calls).toContain('route 2');
    expect(store.getState().route).toHaveLength(2);

    controller.clearRoute();
    expect(map.calls).toContain('clear route');
    expect(store.getState().route).toBeNull();
  });

  it('calculateRoute(): destination/route not found, and route errors with Retry', async () => {
    const noDest = setup({ search: async () => null });
    noDest.controller.start();
    await flush();
    expect(await noDest.controller.calculateRoute('x')).toBe(false);
    expect(noDest.status.errors[0]!.message).toBe(t('message.destinationNotFound'));

    const noRoute = setup({ route: async () => null });
    noRoute.controller.start();
    await flush();
    expect(await noRoute.controller.calculateRoute('x')).toBe(false);
    expect(noRoute.status.errors[0]!.message).toBe(t('message.routeNotFound'));

    let fail = true;
    const failing = setup({
      route: async (a, b) => {
        if (fail) throw new AppError('http', { status: 500 });
        return [a, b];
      },
    });
    failing.controller.start();
    await flush();
    expect(await failing.controller.calculateRoute('x')).toBe(false);
    expect(failing.status.errors[0]!.message).toBe(
      t('message.routeError', { message: t('errors.http', { status: 500 }) }),
    );
    fail = false;
    failing.status.errors[0]!.retry!();
    await flush();
    expect(failing.store.getState().route).toHaveLength(2);
  });

  it('refreshAll(): re-downloads every loaded province with force, then re-renders', async () => {
    const { controller, loads, rerenders } = setup();
    controller.start();
    await flush();
    await controller.refreshAll();
    expect(loads).toEqual([
      { code: '28', force: false },
      { code: '28', force: true },
    ]);
    expect(rerenders()).toBe(2);
  });

  it('an origin near a border also loads the neighbouring province', async () => {
    const radii: number[] = [];
    const { controller, loads, status } = setup({
      shapes: { provincesWithin: (_, km) => (radii.push(km), ['28', '45']) },
    });
    controller.start();
    await flush();
    expect(loads.map((l) => l.code)).toEqual(['28', '45']);
    expect(radii).toEqual([DEFAULT_PREFERENCES.searchRadiusKm + 2]);
    expect(status.errors).toEqual([]);
  });

  it('ensureCoverage(): a wider radius loads newly reached provinces only', async () => {
    let reach = ['28', '45'];
    const { controller, store, loads, rerenders } = setup({ shapes: { provincesWithin: () => reach } });
    controller.start();
    await flush();
    const before = rerenders();
    reach = ['28', '45', '19'];
    await controller.ensureCoverage();
    expect(loads.map((l) => l.code)).toEqual(['28', '45', '19']);
    expect(store.getState().loadedProvinces).toEqual(['28', '45', '19']);
    expect(rerenders()).toBe(before + 1);
    await controller.ensureCoverage(); // nothing new: no download, no re-render
    expect(loads).toHaveLength(3);
    expect(rerenders()).toBe(before + 1);
  });

  it('a province that fails shows its own error while the others still load', async () => {
    const { controller, store, status } = setup({
      shapes: { provincesWithin: () => ['28', '45', '19'] },
      failing: ['45'],
    });
    controller.start();
    await flush();
    expect(store.getState().loadedProvinces).toEqual(['28', '19']);
    expect(status.errors.map((e) => e.message)).toEqual([
      t('message.provinceError', { message: t('errors.download-failed') }),
    ]);
  });

  it('uses the outlines when reverse geocoding finds no province', async () => {
    const { controller, loads, status } = setup({
      reverse: () => Promise.reject(new Error('offline')),
      shapes: { provinceAt: () => '45' },
    });
    controller.start();
    await flush();
    expect(loads.map((l) => l.code)).toEqual(['45']);
    expect(status.errors).toEqual([]);
  });

  it('works as before when the outlines fail to load', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const { controller, loads, status } = setup({ shapes: null });
      controller.start();
      await flush();
      expect(loads.map((l) => l.code)).toEqual(['28']);
      expect(status.errors).toEqual([]);
      await controller.ensureCoverage();
      expect(loads).toHaveLength(1);
    } finally {
      console.warn = warn;
    }
  });

  it('calculateRoute(): loads every province along the route', async () => {
    const detours: number[] = [];
    const { controller, loads } = setup({
      search: async () => ({ ...GETAFE, provinceCode: '50' }),
      shapes: { provincesAlongRoute: (_, km) => (detours.push(km), ['28', '19', '50']) },
    });
    controller.start();
    await flush();
    expect(await controller.calculateRoute('Zaragoza')).toBe(true);
    expect(loads.map((l) => l.code)).toEqual(['28', '50', '19']);
    expect(detours).toEqual([DEFAULT_PREFERENCES.routeDetourKm + 2]);
  });

  it("showFavourites(): loads the favourites' provinces that aren't loaded; off just clears the flag", async () => {
    const { controller, store, loads, rerenders } = setup();
    controller.start();
    await flush();
    store.update((s) =>
      setPreferences(s, {
        favourites: [
          { id: 'a', provinceCode: '28', brand: 'X' },
          { id: 'b', provinceCode: '07', brand: 'X' },
        ],
      }),
    );
    const before = rerenders();
    await controller.showFavourites(true);
    expect(store.getState().favouritesOnly).toBe(true);
    expect(loads.map((l) => l.code)).toEqual(['28', '07']);
    expect(rerenders()).toBe(before + 1);

    await controller.showFavourites(false);
    expect(store.getState().favouritesOnly).toBe(false);
    expect(loads).toHaveLength(2);
  });
});
