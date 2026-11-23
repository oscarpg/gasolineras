import type { AppState } from '../../../state/appState';
import type { Store } from '../../../state/store';
import { setPreferences } from '../../../state/transitions';
import type { LocationController } from '../../locationController';
import { byId, syncChecked, syncValue } from '../../dom';
import { i18n } from '../../i18nContext';

/** Sliders fire many events while dragged: wait this long after the last one before loading provinces. */
export const COVERAGE_DEBOUNCE_MS = 400;

/**
 * The distance controls of the filters panel (search radius, route detour, route
 * only), plus the top-bar GPS button and "refresh prices". Searching an address or
 * a destination is the search bar's job (searchBar.ts).
 */
export function createLocationRouteSections(store: Store<AppState>, location: LocationController) {
  const radius = byId<HTMLInputElement>('search-radius');
  const radiusValue = byId('search-radius-value');
  const detour = byId<HTMLInputElement>('route-detour');
  const detourValue = byId('route-detour-value');
  const routeOnly = byId<HTMLInputElement>('route-only');

  byId('quick-gps').addEventListener('click', () => location.requestGps());
  byId('refresh-prices').addEventListener('click', () => void location.refreshAll());

  // A wider radius or detour can reach provinces that aren't loaded yet.
  let coverageTimer: ReturnType<typeof setTimeout> | undefined;
  const ensureCoverageSoon = () => {
    clearTimeout(coverageTimer);
    coverageTimer = setTimeout(() => void location.ensureCoverage(), COVERAGE_DEBOUNCE_MS);
  };

  radius.addEventListener('input', () => {
    store.update((s) => setPreferences(s, { searchRadiusKm: Number(radius.value) }));
    ensureCoverageSoon();
  });
  detour.addEventListener('input', () => {
    store.update((s) => setPreferences(s, { routeDetourKm: Number(detour.value) }));
    ensureCoverageSoon();
  });
  routeOnly.addEventListener('change', () => {
    store.update((s) => setPreferences(s, { routeOnly: routeOnly.checked }));
    ensureCoverageSoon();
  });

  return {
    render(state: AppState) {
      const p = state.preferences;
      const { decimal, t } = i18n();
      syncValue(radius, String(p.searchRadiusKm));
      syncValue(detour, String(p.routeDetourKm));
      syncChecked(routeOnly, p.routeOnly);
      radiusValue.textContent = decimal(p.searchRadiusKm);
      detourValue.textContent = decimal(p.routeDetourKm);
      radius.setAttribute('aria-valuetext', t('unit.km', { value: decimal(p.searchRadiusKm) }));
      detour.setAttribute('aria-valuetext', t('unit.km', { value: decimal(p.routeDetourKm) }));
    },
  };
}
