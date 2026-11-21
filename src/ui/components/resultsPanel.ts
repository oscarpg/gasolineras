import type { VisibleStations } from '../../domain/filters';
import type { AppState } from '../../state/appState';
import { selectActiveCar, selectIsCheckingHistory } from '../../state/selectors';
import type { Store } from '../../state/store';
import { setPreferences } from '../../state/transitions';
import { byId, delegate, html, setHtml, syncChecked } from '../dom';
import { statusSummary, TEXT } from '../text';
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
  const panel = byId('panelBaratas');
  const toggleIcon = byId('iconoToggleBaratas');
  const sortOption = byId('contenedorChkCoste');
  const sortCheckbox = byId<HTMLInputElement>('chkOrdenCosteReal');
  const sortLabel = byId('lblOrdenCosteReal');
  const status = byId('estado');
  const list = byId('listaBaratas');

  byId('toggleBaratas').addEventListener('click', () => {
    const minimized = panel.classList.toggle('minimizado');
    toggleIcon.textContent = minimized ? '▲' : '▼';
  });
  sortCheckbox.addEventListener('change', () =>
    store.update((s) => setPreferences(s, { sortByTotalCost: sortCheckbox.checked })),
  );
  delegate(list, 'click', '.item-gasolinera', (card) => onSelect(card.dataset.station!));

  let lastCar: unknown = undefined;

  function renderSortOption(state: AppState) {
    const car = selectActiveCar(state);
    syncChecked(sortCheckbox, state.preferences.sortByTotalCost);
    if (car === lastCar) return;
    lastCar = car;
    sortCheckbox.disabled = !car;
    sortOption.classList.toggle('deshabilitado', !car);
    sortLabel.textContent = car ? TEXT.sortByCostWithCar(car.name) : TEXT.sortByCostNoCar;
  }

  function renderList(state: AppState, { rows, sortedByTotalCost }: VisibleStations) {
    if (rows.length === 0) {
      setHtml(list, html`<em class="u-text-sm u-text-muted">${TEXT.noResults}</em>`);
      return;
    }
    const context = { car: selectActiveCar(state), hasRoute: !!state.route, sortedByTotalCost };
    setHtml(
      list,
      html`${rows
        .slice(0, MAX_LISTED)
        .map(
          (row, i) =>
            html`<div class="item-gasolinera" data-station="${row.station.id}">${stationCardHtml(row, i, context)}</div>`,
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
        agePreset: p.ageFilterPreset,
        customDays: p.ageFilterCustomDays,
        checkingHistory: selectIsCheckingHistory(state),
        sortedByTotalCost: visible.sortedByTotalCost,
        hasRoute: !!state.route,
        radiusKm: p.searchRadiusKm,
      });
    },
  };
}
