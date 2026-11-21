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
  /**
   * Shows an error that stays until the user retries or dismisses it, or another
   * operation clears it. With `retry`, a Retry button runs it.
   */
  error(message: string, retry?: () => void): void;
  /** Hides the error, if any. */
  clearError(): void;
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
  const errorBox = byId('status-error');
  const list = byId('results-list');
  const toggle = byId('results-toggle');
  const body = byId('results-body');

  // Collapse toggle: a div with role="button", so it needs its own keyboard handling.
  const toggleMinimized = () => {
    const minimized = panel.classList.toggle('is-minimized');
    toggleIcon.textContent = minimized ? '▲' : '▼';
    toggle.setAttribute('aria-expanded', String(!minimized));
    body.inert = minimized;
  };
  toggle.addEventListener('click', toggleMinimized);
  toggle.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleMinimized();
    }
  });

  let retryAction: (() => void) | null = null;
  const clearError = () => {
    retryAction = null;
    errorBox.hidden = true;
    errorBox.replaceChildren();
  };
  delegate(errorBox, 'click', '[data-action="retry"]', () => {
    const retry = retryAction;
    clearError();
    retry?.();
  });
  delegate(errorBox, 'click', '[data-action="dismiss"]', clearError);

  sortCheckbox.addEventListener('change', () =>
    store.update((s) => setPreferences(s, { sortByTotalCost: sortCheckbox.checked })),
  );
  delegate(list, 'click', '.station-card', (card) => onSelect(card.dataset.station!));
  delegate(list, 'keydown', '.station-card', (card, event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      onSelect(card.dataset.station!);
    }
  });

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
    // Re-rendering replaces the cards; keep keyboard focus on the same station if it is still listed.
    const focused = list.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).closest<HTMLElement>('.station-card')?.dataset.station
      : undefined;
    setHtml(
      list,
      html`${rows
        .slice(0, MAX_LISTED)
        .map(
          (row, i) =>
            html`<div class="station-card" role="button" tabindex="0" data-station="${row.station.id}">${stationCardHtml(row, i, context)}</div>`,
        )}`,
    );
    if (focused)
      [...list.querySelectorAll<HTMLElement>('.station-card')]
        .find((c) => c.dataset.station === focused)
        ?.focus();
  }

  return {
    prepare: renderSortOption,
    show(message) {
      status.textContent = message;
    },
    error(message, retry) {
      const { t } = i18n();
      retryAction = retry ?? null;
      setHtml(
        errorBox,
        html`<span class="status-error-text">⚠️ ${message}</span>${
          retry ? html`<button type="button" data-action="retry">${t('message.retry')}</button>` : ''
        }<button type="button" class="btn-secondary" data-action="dismiss" aria-label="${t('message.dismiss')}" title="${t('message.dismiss')}">✕</button>`,
      );
      errorBox.hidden = false;
    },
    clearError,
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
