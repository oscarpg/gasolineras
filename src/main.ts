/**
 * Application entry point and composition root: creates the services, the
 * store and its side effects, then starts the UI.
 *
 * Swapping an implementation (e.g. Capacitor storage or geolocation in a mobile
 * app) only needs a change here.
 */
import { browserGeoProvider } from './platform/geolocation';
import { createGeocoder } from './services/geocoding';
import { createHttpClient } from './services/http';
import { createMitecoService } from './services/miteco';
import { createRouter } from './services/routing';
import { createInitialState } from './state/appState';
import { createEffects } from './state/effects';
import { persistPreferences } from './state/persistence';
import { createStore } from './state/store';
import { localStorageAdapter } from './storage/adapter';
import { createCache, removeKeysWithPrefix } from './storage/cache';
import { loadPreferences, savePreferences } from './storage/preferences';
import { startApp } from './ui/app';

/** Bump the version to invalidate every cached download after a format change. */
const CACHE_NAMESPACE = 'gasolineras.cache.v2:';
/** Cache keys written by the original single-file app. */
const LEGACY_CACHE_PREFIXES = ['gasolineras_prov_', 'gas_hist_'];

// Storage
const storage = localStorageAdapter();
removeKeysWithPrefix(storage, LEGACY_CACHE_PREFIXES);
const cache = createCache(storage, { namespace: CACHE_NAMESPACE });
cache.purgeExpired();

// Services
const http = createHttpClient();
const miteco = createMitecoService({ http, cache });
const geocoder = createGeocoder({ http });
const router = createRouter({ http });
const gps = browserGeoProvider();

// State
const store = createStore(createInitialState(loadPreferences(storage)));
const effects = createEffects({ store, miteco });

// Save migrated/adjusted preferences right away, then on every change.
savePreferences(storage, store.getState().preferences);
const persistence = persistPreferences(store, (preferences) => savePreferences(storage, preferences));
window.addEventListener('pagehide', persistence.flush);

// UI
startApp({ store, effects, miteco, geocoder, router, gps });
