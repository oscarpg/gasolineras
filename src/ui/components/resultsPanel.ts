import type { VisibleStations } from '../../domain/filters';
import type { AppState } from '../../state/appState';
import { selectActiveCar, selectIsCheckingHistory } from '../../state/selectors';
import type { Store } from '../../state/store';
import { setPreferences } from '../../state/transitions';
import { byId, delegate, html, setHtml, syncChecked } from '../dom';
import { statusSummary } from '../format';
import { i18n } from '../i18nContext';
import { stationCardHtml } from './stationCard';

/** How many result cards the panel lists (the map shows all). */
export const MAX_LISTED = 20;

export interface StatusLine {
  /** Shows a temporary message; the next render replaces it with the summary. */
  show(message: string): void;
}

export interface ResultsPanel extends StatusLine {
  /** Initial state of the sort option (before any results exist). */
  prepare(state: AppState): void;
  render(state: AppState, visible: VisibleStations): void;
}

/**
 * The floating "cheapest stations" panel: collapse toggle, sort-by-cost option,
 * status line and the top results. Clicking a card calls `onSelect`.
 */
export function createResultsPanel(
  store: Store<AppState>,
  onSelect: (stationId: string) => void,
): ResultsPanel {
  const panel = byId('results-panel');
  const toggleIcon = byId('results-toggle-icon');
  const sortOption = byId('sort-by-cost-option');
  const sortCheckbox = byId<HTMLInputElement>('sort-by-cost');
  const sortLabel = byId('sort-by-cost-label');
  const status = byId('status');
  const list = byId('results-list');

  byId('results-toggle').addEventListener('click', () => {
    const minimized = panel.classList.toggle('is-minimized');
    toggleIcon.textContent = minimized ? '▲' : '▼';
  });
  sortCheckbox.addEventListener('change', () =>
    store.update((s) => setPreferences(s, { sortByTotalCost: sortCheckbox.checked })),
  );
  delegate(list, 'click', '.station-card', (card) => onSelect(card.dataset.station!));

  let last: { car: unknown; locale: string } | null = null;

  function renderSortOption(state: AppState) {
    const car = selectActiveCar(state);
    const { locale, t } = i18n();
    syncChecked(sortCheckbox, state.preferences.sortByTotalCost);
    if (last && last.car === car && last.locale === locale) return;
    last = { car, locale };
    sortCheckbox.disabled = !car;
    sortOption.classList.toggle('is-disabled', !car);
    sortLabel.textContent = car ? t('results.sortWithCar', { car: car.name }) : t('results.sortNoCar');
  }

  function renderList(state: AppState, { rows, sortedByTotalCost }: VisibleStations) {
    if (rows.length === 0) {
      setHtml(list, html`<em class="u-text-sm u-text-muted">${i18n().t('results.none')}</em>`);
      return;
    }
    const context = { car: selectActiveCar(state), hasRoute: !!state.route, sortedByTotalCost };
    setHtml(
      list,
      html`${rows
        .slice(0, MAX_LISTED)
        .map(
          (row, i) =>
            html`<div class="station-card" data-station="${row.station.id}">${stationCardHtml(row, i, context)}</div>`,
        )}`,
    );
  }

  return {
    prepare: renderSortOption,
    show(message) {
      status.textContent = message;
    },
    render(state, visible) {
      renderSortOption(state);
      renderList(state, visible);
      const p = state.preferences;
      status.textContent = statusSummary({
        count: visible.rows.length,
        fuel: p.fuel,
        carName: selectActiveCar(state)?.name ?? null,
        ageOption: p.ageFilterOption,
        customDays: p.ageFilterCustomDays,
        checkingHistory: selectIsCheckingHistory(state),
        sortedByTotalCost: visible.sortedByTotalCost,
        hasRoute: !!state.route,
        radiusKm: p.searchRadiusKm,
      });
    },
  };
}
