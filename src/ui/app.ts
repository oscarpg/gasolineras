/**
 * Builds the UI from its components and keeps it in sync with the store.
 *
 * Each component reads the state it needs and skips work when its inputs (and
 * the language) haven't changed; map markers are diffed. All HTML is built with
 * the escaping `html` helper, and dynamic buttons use event delegation.
 */
import { loadProvinceShapes, type ProvinceShapes } from '../domain/provinceShapes';
import { createI18n, resolveLocale } from '../i18n';
import type { GeoProvider } from '../platform/geolocation';
import type { Geocoder } from '../services/geocoding';
import type { MitecoService } from '../services/miteco';
import type { Router } from '../services/routing';
import type { AppState } from '../state/appState';
import type { Effects } from '../state/effects';
import { createVisibleStationsSelector, selectActiveCar } from '../state/selectors';
import type { Store } from '../state/store';
import { bindPriceHistoryButtons } from './components/priceChart';
import { createCarsSection } from './components/prefsDrawer/carsSection';
import { createDiscountsSection } from './components/prefsDrawer/discountsSection';
import { createDrawer } from './components/prefsDrawer/drawer';
import { createFiltersSection } from './components/prefsDrawer/filtersSection';
import { createLanguageSection } from './components/prefsDrawer/languageSection';
import { createLocationRouteSections } from './components/prefsDrawer/locationRouteSections';
import { createResultsPanel } from './components/resultsPanel';
import { i18n, setI18n, translateStaticText } from './i18nContext';
import { createLocationController } from './locationController';
import type { LeafletStatic } from './map/leaflet';
import { createMapView } from './map/mapView';
import { createStationMarkers } from './map/stationMarkers';
import { createToaster } from './toast';

export interface AppContext {
  store: Store<AppState>;
  effects: Effects;
  miteco: MitecoService;
  geocoder: Geocoder;
  router: Router;
  gps: GeoProvider;
  /** The map library (main.ts passes Leaflet; tests pass a fake). */
  leaflet: LeafletStatic;
  /** The province outlines (default: the bundled file, loaded lazily). */
  provinceShapes?: () => Promise<ProvinceShapes>;
  /** Browser language preferences, used when the user hasn't chosen a language. */
  browserLanguages?: readonly string[];
}

/** Zoom used when a result card is clicked. */
const STATION_ZOOM = 15;

export function startApp({
  store,
  effects,
  miteco,
  geocoder,
  router,
  gps,
  leaflet,
  provinceShapes = loadProvinceShapes,
  browserLanguages = navigator.languages ?? [navigator.language],
}: AppContext): void {
  /** Switches the translator when the chosen (or browser) language changes. Returns true if it changed. */
  const applyLocale = (state: AppState): boolean => {
    const locale = resolveLocale(state.preferences.locale, browserLanguages);
    if (locale === i18n().locale && document.documentElement.lang === locale) return false;
    setI18n(createI18n(locale));
    translateStaticText();
    return true;
  };
  applyLocale(store.getState());

  const selectVisible = createVisibleStationsSelector();
  const toast = createToaster();
  const mapView = createMapView('map', leaflet);
  const markers = createStationMarkers(mapView.L, mapView.stationsLayer);
  const drawer = createDrawer();

  const results = createResultsPanel(store, (stationId) => {
    const station = store.getState().stations.find((s) => s.id === stationId);
    if (!station) return;
    mapView.focus([station.lat, station.lon], STATION_ZOOM);
    markers.open(stationId);
  });

  const location = createLocationController({
    store,
    effects,
    miteco,
    geocoder,
    router,
    gps,
    mapView,
    status: results,
    provinceShapes,
    rerender: () => render(store.getState()),
  });

  const sections = [
    createLocationRouteSections(store, location, drawer),
    createFiltersSection(store, effects),
    createCarsSection(store, toast),
    createDiscountsSection(store),
    createLanguageSection(store),
  ];

  bindPriceHistoryButtons(document, { store, miteco });

  function render(state: AppState) {
    applyLocale(state);
    for (const section of sections) section.render(state);
    const visible = selectVisible(state);
    markers.update(visible.rows, {
      fuel: state.preferences.fuel,
      car: selectActiveCar(state),
      hasRoute: !!state.route,
    });
    results.render(state, visible);
  }

  // Initial screen: controls, cars, discounts and the sort option reflect the saved preferences;
  // results appear on the first state change (as in the original app).
  const initial = store.getState();
  for (const section of sections) section.render(initial);
  results.prepare(initial);
  store.subscribe(render);

  location.start();
}
