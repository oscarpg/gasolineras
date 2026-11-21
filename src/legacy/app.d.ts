/** Types for the legacy UI module (plain JS until Phase 5). */
import type { Geocoder } from '../services/geocoding';
import type { MitecoService } from '../services/miteco';
import type { Router } from '../services/routing';
import type { GeoProvider } from '../platform/geolocation';
import type { AppState } from '../state/appState';
import type { Effects } from '../state/effects';
import type { Store } from '../state/store';

export interface LegacyAppContext {
  store: Store<AppState>;
  effects: Effects;
  miteco: MitecoService;
  geocoder: Geocoder;
  router: Router;
  gps: GeoProvider;
}

export function startLegacyApp(context: LegacyAppContext): void;
