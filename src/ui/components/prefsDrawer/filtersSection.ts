import { isFuelType } from '../../../config/fuels';
import { AGE_FILTER_OPTION_IDS, isAgeFilterOption, isCustomAgeOption } from '../../../domain/ageFilter';
import type { AppState } from '../../../state/appState';
import type { Effects } from '../../../state/effects';
import { countBrands } from '../../../state/selectors';
import type { Store } from '../../../state/store';
import {
  resetFilters,
  setAllBrands,
  setBrandSelected,
  setCustomAgeDays,
  setFuel,
  setPreferences,
} from '../../../state/transitions';
import { byId, delegate, html, setHtml, syncValue } from '../../dom';
import { AGE_OPTION_LABELS, brandLabel, historyStatusText } from '../../format';
import { i18n } from '../../i18nContext';
import { renderFuelOptions } from './carsSection';

/**
 * The station filters in the filters panel: fuel, age-of-price filter, brand
 * checklist (with "select all" / "deselect all") and "reset filters". The radius,
 * detour and route-only controls are wired by locationRouteSections.ts.
 */
export function createFiltersSection(store: Store<AppState>, effects: Effects) {
  const fuel = byId<HTMLSelectElement>('fuel');
  const age = byId<HTMLSelectElement>('age-filter');
  const customDays = byId<HTMLInputElement>('custom-days');
  const customDaysRow = byId('custom-days-row');
  const historyInfo = byId('history-status');
  const brandList = byId('brand-list');
  const brandsHint = byId('brands-hint');
  const brandButtons = [
    byId<HTMLButtonElement>('brands-deselect-all'),
    byId<HTMLButtonElement>('brands-select-all'),
  ];

  fuel.addEventListener('change', () => {
    const value = fuel.value;
    if (isFuelType(value)) store.update((s) => setFuel(s, value));
  });
  age.addEventListener('change', () => {
    const value = age.value;
    if (!isAgeFilterOption(value)) return;
    store.update((s) => setPreferences(s, { ageFilterOption: value }));
    void effects.ensureHistoryForFilter();
  });
  customDays.addEventListener('change', () => {
    store.update((s) => setCustomAgeDays(s, Number(customDays.value)));
    void effects.ensureHistoryForFilter();
  });

  // Nothing ticked means no brand filter, so "deselect all" is how to start picking a few.
  const setAll = (all: boolean) =>
    store.update((s) =>
      setAllBrands(
        s,
        all,
        countBrands(s.stations).map(([b]) => b),
      ),
    );
  byId('brands-deselect-all').addEventListener('click', () => setAll(true));
  byId('brands-select-all').addEventListener('click', () => setAll(false));
  byId('reset-filters').addEventListener('click', () => store.update(resetFilters));
  delegate(brandList, 'change', 'input[data-brand]', (input) =>
    store.update((s) => setBrandSelected(s, input.dataset.brand!, (input as HTMLInputElement).checked)),
  );

  const initial = store.getState();
  // The brand list is first built when stations arrive (until then index.html shows a placeholder).
  let lastBrands = { stations: initial.stations, brands: initial.preferences.brands, locale: i18n().locale };
  let lastHistory: { status: AppState['historyStatus']; locale: string } = {
    status: initial.historyStatus,
    locale: i18n().locale,
  };
  let lastLocale: string | null = null;

  function renderOptions() {
    const { t, locale } = i18n();
    if (locale === lastLocale) return;
    lastLocale = locale;
    renderFuelOptions(fuel);
    const selected = age.value;
    setHtml(
      age,
      html`${AGE_FILTER_OPTION_IDS.map((id) => html`<option value="${id}">${t(AGE_OPTION_LABELS[id])}</option>`)}`,
    );
    if (selected) age.value = selected;
  }

  function renderBrands(state: AppState) {
    const { stations } = state;
    const { brands } = state.preferences;
    const { t, locale } = i18n();
    if (lastBrands.stations === stations && lastBrands.brands === brands && lastBrands.locale === locale)
      return;
    lastBrands = { stations, brands, locale };

    const counts = countBrands(stations);
    brandsHint.hidden = counts.length === 0 || brands.length > 0;
    for (const button of brandButtons) button.disabled = counts.length === 0;
    if (counts.length === 0) {
      // Nothing loaded yet: keep (and translate) the placeholder.
      setHtml(
        brandList,
        html`<em class="u-text-sm">${t(stations.length ? 'filters.noStations' : 'filters.waiting')}</em>`,
      );
      return;
    }
    const selected = new Set(brands);
    setHtml(
      brandList,
      html`${counts.map(
        ([brand, n]) =>
          html`<label><input type="checkbox" data-brand="${brand}" ${selected.has(brand) ? 'checked' : ''}> ${brandLabel(brand)} (${n})</label>`,
      )}`,
    );
  }

  return {
    render(state: AppState) {
      const p = state.preferences;
      renderOptions();
      syncValue(fuel, p.fuel);
      syncValue(age, p.ageFilterOption);
      syncValue(customDays, String(p.ageFilterCustomDays));
      customDaysRow.hidden = !isCustomAgeOption(p.ageFilterOption);

      const locale = i18n().locale;
      if (state.historyStatus !== lastHistory.status || locale !== lastHistory.locale) {
        lastHistory = { status: state.historyStatus, locale };
        if (state.historyStatus) historyInfo.textContent = historyStatusText(state.historyStatus);
      }
      renderBrands(state);
    },
  };
}
