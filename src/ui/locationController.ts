import type { ProvinceShapes } from '../domain/provinceShapes';
import type { LatLng } from '../domain/types';
import type { GeoProvider } from '../platform/geolocation';
import type { Geocoder } from '../services/geocoding';
import type { MitecoService } from '../services/miteco';
import type { Router } from '../services/routing';
import type { AppState } from '../state/appState';
import { provincesNeeded } from '../state/coverage';
import type { Effects } from '../state/effects';
import type { Store } from '../state/store';
import { resetHistoryDepth, setFavouritesOnly, setRoute, setUserPosition } from '../state/transitions';
import type { StatusLine } from './components/resultsPanel';
import { errorText } from './format';
import { i18n } from './i18nContext';
import type { MapView } from './map/mapView';

export interface LocationControllerDeps {
  store: Store<AppState>;
  effects: Effects;
  miteco: Pick<MitecoService, 'hasCachedProvince'>;
  geocoder: Geocoder;
  router: Router;
  gps: GeoProvider;
  mapView: MapView;
  status: StatusLine;
  /** The province outlines (loaded lazily). If they fail to load, only the origin's province is used. */
  provinceShapes: () => Promise<ProvinceShapes>;
  /** Re-renders from the current state (used to replace temporary status messages). */
  rerender: () => void;
}

export interface LocationController {
  /** Asks the device for its position and uses it as the origin. */
  requestGps(): void;
  /** Geocodes an address and uses it as the origin. Resolves true on success. */
  searchAddress(query: string): Promise<boolean>;
  /** Geocodes a destination and draws the route from the origin. Resolves true on success. */
  calculateRoute(query: string): Promise<boolean>;
  clearRoute(): void;
  /** Re-downloads every loaded province and rechecks price history. */
  refreshAll(): Promise<void>;
  /**
   * Loads every province the current radius, detour, route or favourites reach that
   * isn't loaded yet (call after those change).
   */
  ensureCoverage(): Promise<void>;
  /** Shows only favourites (loading their provinces if needed), or goes back to the normal list. */
  showFavourites(on: boolean): Promise<void>;
  /** First location attempt when the app opens. */
  start(): void;
}

/**
 * The location/route flows: they combine geocoding, the map, province loading and
 * status messages, so they live here instead of in a single section.
 */
export function createLocationController(d: LocationControllerDeps): LocationController {
  const { store, status } = d;

  /**
   * Shows an error (with Retry when given) and puts the status line back to the
   * summary, or to "waiting for location" while there is no origin yet.
   */
  function fail(message: string, retry?: () => void) {
    status.error(message, retry);
    if (store.getState().userPosition) d.rerender();
    else status.show(i18n().t('results.waiting'));
  }

  /** Loads a province's stations. On failure shows an error with Retry and resolves false. */
  async function loadProvince(code: string | null, force = false): Promise<boolean> {
    if (!code) return true;
    if (!force && store.getState().loadedProvinces.includes(code)) return true;
    if (force || !d.miteco.hasCachedProvince(code))
      status.show(i18n().t('message.downloadingProvince', { code }));
    try {
      await d.effects.loadProvince(code, { force });
      return true;
    } catch (error) {
      status.error(i18n().t('message.provinceError', { message: errorText(error) }), () => {
        void loadProvince(code, force).then((ok) => ok && d.rerender());
      });
      return false;
    }
  }

  /** The outlines, or null if they couldn't be loaded (logged once per attempt). */
  async function shapes(): Promise<ProvinceShapes | null> {
    try {
      return await d.provinceShapes();
    } catch (error) {
      console.warn('Province outlines unavailable:', error);
      return null;
    }
  }

  /**
   * Loads every needed province that isn't loaded yet, one after another. A failure
   * shows its own error (with Retry) and the others still load. Resolves true if
   * anything was loaded.
   */
  async function loadProvincesNeeded(): Promise<boolean> {
    const s = await shapes();
    if (!s) return false;
    let loaded = false;
    for (const code of provincesNeeded(store.getState(), s)) {
      if (store.getState().loadedProvinces.includes(code)) continue;
      if (await loadProvince(code)) loaded = true;
    }
    return loaded;
  }

  async function setOrigin([lat, lon]: LatLng, zoom = 13, province: string | null = null) {
    status.clearError();
    d.mapView.showUserPosition([lat, lon], zoom);
    store.update((s) => setUserPosition(s, [lat, lon]));

    if (!province) {
      status.show(i18n().t('message.findingProvince'));
      try {
        province = await d.geocoder.reverseProvince([lat, lon]);
      } catch {
        province = null;
      }
      // Offline outlines when geocoding fails.
      province ??= (await shapes())?.provinceAt([lat, lon]) ?? null;
    }

    if (province) await loadProvince(province);
    else status.error(i18n().t('message.provinceUnknown'), () => void setOrigin([lat, lon], zoom));
    // Neighbouring provinces within the search radius.
    await loadProvincesNeeded();
    // The summary replaces temporary messages; errors stay in their own box until retried or dismissed.
    d.rerender();
  }

  function requestGps() {
    status.clearError();
    status.show(i18n().t('message.locatingGps'));
    d.gps.getCurrentPosition().then(
      (position) => setOrigin(position),
      (error: unknown) => fail(i18n().t('message.gpsError', { message: errorText(error) }), requestGps),
    );
  }

  async function searchAddress(query: string): Promise<boolean> {
    status.clearError();
    status.show(i18n().t('message.searchingAddress'));
    try {
      const place = await d.geocoder.search(query);
      if (!place) {
        fail(i18n().t('message.addressNotFound'));
        return false;
      }
      await setOrigin(place.latLng, 13, place.provinceCode);
      return true;
    } catch (error) {
      fail(i18n().t('message.genericError', { message: errorText(error) }), () => void searchAddress(query));
      return false;
    }
  }

  async function calculateRoute(query: string): Promise<boolean> {
    status.clearError();
    const origin = store.getState().userPosition;
    if (!origin) {
      fail(i18n().t('message.originFirst'));
      return false;
    }
    status.show(i18n().t('message.calculatingRoute'));
    try {
      const place = await d.geocoder.search(query);
      if (!place) {
        fail(i18n().t('message.destinationNotFound'));
        return false;
      }
      if (place.provinceCode && !store.getState().loadedProvinces.includes(place.provinceCode)) {
        await loadProvince(place.provinceCode);
      }
      const points = await d.router.route(origin, place.latLng);
      if (!points) {
        fail(i18n().t('message.routeNotFound'));
        return false;
      }
      d.mapView.showRoute(points);
      store.update((s) => setRoute(s, points));
      // Every province along the route, not just the destination's.
      if (await loadProvincesNeeded()) d.rerender();
      return true;
    } catch (error) {
      fail(i18n().t('message.routeError', { message: errorText(error) }), () => void calculateRoute(query));
      return false;
    }
  }

  return {
    requestGps,

    searchAddress,
    calculateRoute,

    clearRoute() {
      d.mapView.clearRoute();
      store.update((s) => setRoute(s, null));
    },

    async refreshAll() {
      status.clearError();
      store.update(resetHistoryDepth);
      for (const code of [...store.getState().loadedProvinces]) await loadProvince(code, true);
      d.rerender();
    },

    async ensureCoverage() {
      if (await loadProvincesNeeded()) d.rerender();
    },

    async showFavourites(on) {
      store.update((s) => setFavouritesOnly(s, on));
      if (!on) return;
      status.clearError();
      await loadProvincesNeeded();
      d.rerender();
    },

    start() {
      if (!d.gps.isAvailable()) {
        status.show(i18n().t('message.noGeolocation'));
        return;
      }
      status.show(i18n().t('message.locating'));
      d.gps.getCurrentPosition().then(
        (position) => setOrigin(position),
        () => status.show(i18n().t('message.noLocationYet')),
      );
    },
  };
}
