import { FUEL_TYPES, isFuelType } from '../../../config/fuels';
import { isAgeFilterPreset } from '../../../domain/ageFilter';
import type { AppState } from '../../../state/appState';
import type { Effects } from '../../../state/effects';
import { countBrands } from '../../../state/selectors';
import type { Store } from '../../../state/store';
import {
  setAllBrands,
  setBrandSelected,
  setCustomAgeDays,
  setFuel,
  setPreferences,
} from '../../../state/transitions';
import { byId, delegate, html, setHtml, syncValue } from '../../dom';
import { fuelLabel, historyStatusText, TEXT } from '../../text';

/** "Filtros de gasolineras": fuel, age-of-price filter and brand checklist. */
export function createFiltersSection(store: Store<AppState>, effects: Effects) {
  const fuel = byId<HTMLSelectElement>('carburante');
  const age = byId<HTMLSelectElement>('antiguedad');
  const customDays = byId<HTMLInputElement>('diasAntiguedadVal');
  const customDaysRow = byId('filaDiasCustom');
  const historyInfo = byId('infoEstadoAntiguedad');
  const brandList = byId('marcas');

  for (const f of FUEL_TYPES) fuel.add(new Option(fuelLabel(f), f));

  fuel.addEventListener('change', () => {
    const value = fuel.value;
    if (isFuelType(value)) store.update((s) => setFuel(s, value));
  });
  age.addEventListener('change', () => {
    const value = age.value;
    if (!isAgeFilterPreset(value)) return;
    store.update((s) => setPreferences(s, { ageFilterPreset: value }));
    void effects.ensureHistoryForFilter();
  });
  customDays.addEventListener('change', () => {
    store.update((s) => setCustomAgeDays(s, Number(customDays.value)));
    void effects.ensureHistoryForFilter();
  });

  delegate(brandList, 'change', 'input[data-brand-all]', (input) => {
    const checked = (input as HTMLInputElement).checked;
    store.update((s) =>
      setAllBrands(
        s,
        checked,
        countBrands(s.stations).map(([b]) => b),
      ),
    );
  });
  delegate(brandList, 'change', 'input[data-brand]', (input) =>
    store.update((s) => setBrandSelected(s, input.dataset.brand!, (input as HTMLInputElement).checked)),
  );

  const initial = store.getState();
  // The brand list is first built when stations arrive (until then index.html shows a placeholder).
  let lastBrands = { stations: initial.stations, brands: initial.preferences.brands };
  let lastHistory = initial.historyStatus;

  function renderBrands(state: AppState) {
    const { stations } = state;
    const { brands } = state.preferences;
    if (lastBrands.stations === stations && lastBrands.brands === brands) return;
    lastBrands = { stations, brands };

    const counts = countBrands(stations);
    if (counts.length === 0) {
      setHtml(brandList, html`<em class="u-text-sm">${TEXT.noStations}</em>`);
      return;
    }
    const selected = new Set(brands);
    setHtml(
      brandList,
      html`<label><input type="checkbox" id="chkTodas" data-brand-all ${selected.size === 0 ? 'checked' : ''}> ${TEXT.all} (${counts.length})</label>${counts.map(
        ([brand, n]) =>
          html`<label><input type="checkbox" data-brand="${brand}" ${selected.has(brand) ? 'checked' : ''}> ${brand} (${n})</label>`,
      )}`,
    );
  }

  return {
    render(state: AppState) {
      const p = state.preferences;
      syncValue(fuel, p.fuel);
      syncValue(age, p.ageFilterPreset);
      syncValue(customDays, String(p.ageFilterCustomDays));
      customDaysRow.hidden = !(p.ageFilterPreset === 'MAX_X' || p.ageFilterPreset === 'MAS_X');

      if (state.historyStatus !== lastHistory) {
        lastHistory = state.historyStatus;
        if (state.historyStatus) historyInfo.textContent = historyStatusText(state.historyStatus);
      }
      renderBrands(state);
    },
  };
}
