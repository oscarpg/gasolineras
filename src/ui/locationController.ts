import type { LatLng } from '../domain/types';
import type { GeoProvider } from '../platform/geolocation';
import type { Geocoder } from '../services/geocoding';
import type { MitecoService } from '../services/miteco';
import type { Router } from '../services/routing';
import type { AppState } from '../state/appState';
import type { Effects } from '../state/effects';
import type { Store } from '../state/store';
import { resetHistoryDepth, setRoute, setUserPosition } from '../state/transitions';
import type { StatusLine } from './components/resultsPanel';
import { errorMessage } from './dom';
import type { MapView } from './map/mapView';
import { TEXT } from './text';

export interface LocationControllerDeps {
  store: Store<AppState>;
  effects: Effects;
  miteco: Pick<MitecoService, 'hasCachedProvince'>;
  geocoder: Geocoder;
  router: Router;
  gps: GeoProvider;
  mapView: MapView;
  status: StatusLine;
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
  /** First location attempt when the app opens. */
  start(): void;
}

/**
 * The location/route flows: they combine geocoding, the map, province loading and
 * status messages, so they live here instead of in a single section.
 */
export function createLocationController(d: LocationControllerDeps): LocationController {
  const { store, status } = d;

  async function loadProvince(code: string | null, force = false) {
    if (!code) return;
    if (!force && store.getState().loadedProvinces.includes(code)) return;
    if (force || !d.miteco.hasCachedProvince(code)) status.show(TEXT.downloadingProvince(code));
    try {
      await d.effects.loadProvince(code, { force });
    } catch (error) {
      status.show(TEXT.provinceError(errorMessage(error)));
    }
  }

  async function setOrigin([lat, lon]: LatLng, zoom = 13, province: string | null = null) {
    d.mapView.showUserPosition([lat, lon], zoom);
    store.update((s) => setUserPosition(s, [lat, lon]));

    if (!province) {
      status.show(TEXT.findingProvince);
      try {
        province = await d.geocoder.reverseProvince([lat, lon]);
      } catch {
        province = null;
      }
    }

    if (province) await loadProvince(province);
    else status.show(TEXT.provinceUnknown);
    // As in the original app: the summary replaces any temporary message.
    d.rerender();
  }

  function requestGps() {
    status.show(TEXT.locatingGps);
    d.gps.getCurrentPosition().then(
      (position) => setOrigin(position),
      (error: unknown) => status.show(TEXT.gpsError(errorMessage(error))),
    );
  }

  return {
    requestGps,

    async searchAddress(query) {
      status.show(TEXT.searchingAddress);
      try {
        const place = await d.geocoder.search(query);
        if (!place) {
          status.show(TEXT.addressNotFound);
          return false;
        }
        await setOrigin(place.latLng, 13, place.provinceCode);
        return true;
      } catch (error) {
        status.show(TEXT.genericError(errorMessage(error)));
        return false;
      }
    },

    async calculateRoute(query) {
      const origin = store.getState().userPosition;
      if (!origin) {
        status.show(TEXT.originFirst);
        return false;
      }
      status.show(TEXT.calculatingRoute);
      try {
        const place = await d.geocoder.search(query);
        if (!place) {
          status.show(TEXT.destinationNotFound);
          return false;
        }
        if (place.provinceCode && !store.getState().loadedProvinces.includes(place.provinceCode)) {
          await loadProvince(place.provinceCode);
        }
        const points = await d.router.route(origin, place.latLng);
        if (!points) {
          status.show(TEXT.routeNotFound);
          return false;
        }
        d.mapView.showRoute(points);
        store.update((s) => setRoute(s, points));
        return true;
      } catch (error) {
        status.show(TEXT.routeError(errorMessage(error)));
        return false;
      }
    },

    clearRoute() {
      d.mapView.clearRoute();
      store.update((s) => setRoute(s, null));
    },

    async refreshAll() {
      store.update(resetHistoryDepth);
      for (const code of [...store.getState().loadedProvinces]) await loadProvince(code, true);
    },

    start() {
      if (!d.gps.isAvailable()) {
        status.show(TEXT.noGeolocation);
        return;
      }
      status.show(TEXT.locating);
      d.gps.getCurrentPosition().then(
        (position) => setOrigin(position),
        () => status.show(TEXT.noLocationYet),
      );
    },
  };
}
