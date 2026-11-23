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
import { toggleFavourite, widenSearch } from '../state/transitions';
import { createAutoFit } from './autoFit';
import { fuelLabel } from './format';
import { bindPriceHistoryButtons } from './components/priceChart';
import { createCarsSection } from './components/prefsDrawer/carsSection';
import { createDiscountsSection } from './components/prefsDrawer/discountsSection';
import { createDrawer, FILTERS_DRAWER } from './components/prefsDrawer/drawer';
import { createFiltersSection } from './components/prefsDrawer/filtersSection';
import { createLanguageSection } from './components/prefsDrawer/languageSection';
import { createLocationRouteSections } from './components/prefsDrawer/locationRouteSections';
import { createResultsPanel } from './components/resultsPanel';
import { i18n, setI18n, translateStaticText } from './i18nContext';
import { createLocationController } from './locationController';
import type { LeafletStatic } from './map/leaflet';
import { createMapView } from './map/mapView';
import { createStationMarkers } from './map/stationMarkers';
import { byId, delegate } from './dom';
import { bindOfflineBanner } from './offlineBanner';
import { browserShareDeps, shareStation, shareText, type ShareDeps } from './stationActions';
import { createToaster, type Toaster } from './toast';

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
  /** Share sheet and clipboard (default: the browser's). */
  shareDeps?: (toast: Toaster) => ShareDeps;
  /** Touch screen: bigger tap targets for markers (default: from the pointer media query). */
  touch?: boolean;
}

/** Below this width the results panel spans the bottom of the screen (see results-panel.css). */
const NARROW_SCREEN_PX = 700;

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
  shareDeps = browserShareDeps,
  touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
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
  const markers = createStationMarkers(mapView.L, mapView.stationsLayer, { touch });
  const drawer = createDrawer();
  createDrawer(FILTERS_DRAWER);

  const results = createResultsPanel(store, {
    onSelect(stationId) {
      const station = store.getState().stations.find((s) => s.id === stationId);
      if (!station) return;
      mapView.focus([station.lat, station.lon], STATION_ZOOM);
      markers.select(stationId);
      markers.open(stationId);
    },
    onFavouritesOnly: (on) => void location.showFavourites(on),
    onWiden() {
      store.update(widenSearch);
      void location.ensureCoverage();
    },
  });

  // On phones the results panel covers the bottom of the map: keep fitted points above it.
  const resultsPanel = byId('results-panel');
  const autoFit = createAutoFit((points) =>
    mapView.fitPoints(points, {
      bottomPadding: window.innerWidth <= NARROW_SCREEN_PX ? resultsPanel.offsetHeight : 0,
    }),
  );

  // The heart and share buttons in a station's popup (the list handles its own hearts).
  const mapElement = document.getElementById('map') ?? document;
  delegate(mapElement, 'click', '[data-action="favourite"]', (button) => {
    const station = store.getState().stations.find((s) => s.id === button.dataset.station);
    if (station) store.update((s) => toggleFavourite(s, station));
  });
  delegate(mapElement, 'click', '[data-action="share"]', (button) => {
    const state = store.getState();
    const row = selectVisible(state).rows.find((r) => r.station.id === button.dataset.station);
    if (row) void shareStation(shareText(row, fuelLabel(state.preferences.fuel)), shareDeps(toast));
  });

  bindOfflineBanner(byId('offline-banner'));

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
      hasRoute: !!state.route && !state.favouritesOnly,
      favourites: new Set(state.preferences.favourites.map((f) => f.id)),
    });
    results.render(state, visible);
    autoFit.update(state, visible);
  }

  // Initial screen: controls, cars, discounts and the sort option reflect the saved preferences;
  // results appear on the first state change (as in the original app).
  const initial = store.getState();
  for (const section of sections) section.render(initial);
  results.prepare(initial);
  store.subscribe(render);

  location.start();
}
