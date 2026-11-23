import type { VisibleStations } from '../../domain/filters';
import type { AppState } from '../../state/appState';
import { selectActiveCar, selectIsCheckingHistory } from '../../state/selectors';
import type { Store } from '../../state/store';
import { setPreferences, toggleFavourite } from '../../state/transitions';
import { byId, delegate, html, setHtml } from '../dom';
import { statusSummary } from '../format';
import { i18n } from '../i18nContext';
import { favouriteButtonHtml, stationCardHtml } from './stationCard';

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

export interface ResultsPanelActions {
  /** A card was clicked: show the station on the map. */
  onSelect(stationId: string): void;
  /** The favourites chip was toggled. */
  onFavouritesOnly(on: boolean): void;
}

/** The three sort orders of the sort buttons. */
type SortOrder = 'price' | 'distance' | 'total';

const sortOrderOf = (p: AppState['preferences']): SortOrder =>
  p.sortByDistance ? 'distance' : p.sortByTotalCost ? 'total' : 'price';

/** The preferences a sort button sets. */
const SORT_PREFERENCES: Record<SortOrder, { sortByDistance: boolean; sortByTotalCost: boolean }> = {
  price: { sortByDistance: false, sortByTotalCost: false },
  distance: { sortByDistance: true, sortByTotalCost: false },
  total: { sortByDistance: false, sortByTotalCost: true },
};

export interface ResultsPanel extends StatusLine {
  /** Initial state of the sort buttons and the favourites chip (before any results exist). */
  prepare(state: AppState): void;
  render(state: AppState, visible: VisibleStations): void;
}

/**
 * The floating "cheapest stations" panel: collapse toggle, favourites chip, sort
 * buttons, status line and the top results with a favourite button each.
 */
export function createResultsPanel(store: Store<AppState>, actions: ResultsPanelActions): ResultsPanel {
  const panel = byId('results-panel');
  const toggleIcon = byId('results-toggle-icon');
  const favouritesChip = byId<HTMLButtonElement>('favourites-chip');
  const sortGroup = byId('sort-options');
  const sortButtons = [...sortGroup.querySelectorAll<HTMLButtonElement>('[data-sort]')];
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

  favouritesChip.addEventListener('click', () => actions.onFavouritesOnly(!store.getState().favouritesOnly));

  // Sort buttons: a radio group (one tab stop; arrow keys move and select, skipping a disabled button).
  const chooseSort = (button: HTMLButtonElement) => {
    if (button.disabled) return;
    store.update((s) => setPreferences(s, SORT_PREFERENCES[button.dataset.sort as SortOrder]));
  };
  delegate(sortGroup, 'click', '[data-sort]', (button) => chooseSort(button as HTMLButtonElement));
  sortGroup.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const enabled = sortButtons.filter((b) => !b.disabled);
    const current = enabled.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const next = enabled[(current + step + enabled.length) % enabled.length]!;
    chooseSort(next);
    next.focus();
  });

  // The heart sits next to the card, not inside it, so it never selects the card.
  delegate(list, 'click', '[data-action="favourite"]', (button) => {
    const station = store.getState().stations.find((s) => s.id === button.dataset.station);
    if (station) store.update((s) => toggleFavourite(s, station));
  });
  delegate(list, 'click', '.station-card', (card) => actions.onSelect(card.dataset.station!));
  delegate(list, 'keydown', '.station-card', (card, event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      actions.onSelect(card.dataset.station!);
    }
  });

  let last: { car: unknown; locale: string; order: SortOrder; favourites: number; on: boolean } | null = null;

  /** Sort buttons and favourites chip; skipped when nothing they show changed. */
  function renderOptions(state: AppState) {
    const car = selectActiveCar(state);
    const { locale, t } = i18n();
    const order = sortOrderOf(state.preferences);
    const favourites = state.preferences.favourites.length;
    const on = state.favouritesOnly;
    if (
      last &&
      last.car === car &&
      last.locale === locale &&
      last.order === order &&
      last.favourites === favourites &&
      last.on === on
    )
      return;
    last = { car, locale, order, favourites, on };

    // Without a car, "total cost" is disabled and the order shown is €/l.
    const shown = order === 'total' && !car ? 'price' : order;
    for (const button of sortButtons) {
      const isTotal = button.dataset.sort === 'total';
      const checked = button.dataset.sort === shown;
      button.disabled = isTotal && !car;
      button.title = isTotal && !car ? t('results.sortNoCar') : '';
      button.setAttribute('aria-checked', String(checked));
      button.tabIndex = checked ? 0 : -1;
    }

    // The chip stays visible while favourites mode is on, so it can be turned off.
    favouritesChip.hidden = favourites === 0 && !on;
    favouritesChip.textContent = t('favourites.chip', { count: favourites });
    favouritesChip.setAttribute('aria-pressed', String(on));
  }

  function renderList(state: AppState, { rows, sortedByTotalCost }: VisibleStations) {
    if (rows.length === 0) {
      const { t } = i18n();
      const empty = state.favouritesOnly && state.preferences.favourites.length === 0;
      setHtml(
        list,
        html`<em class="u-text-sm u-text-muted">${t(empty ? 'favourites.empty' : 'results.none')}</em>`,
      );
      return;
    }
    const context = {
      car: selectActiveCar(state),
      hasRoute: !!state.route && !state.favouritesOnly,
      sortedByTotalCost,
    };
    const favourites = new Set(state.preferences.favourites.map((f) => f.id));
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
            html`<div class="station-item"><div class="station-card" role="button" tabindex="0" data-station="${row.station.id}">${stationCardHtml(row, i, context)}</div><div class="station-item-actions">${favouriteButtonHtml(row.station, favourites.has(row.station.id))}</div></div>`,
        )}`,
    );
    if (focused)
      [...list.querySelectorAll<HTMLElement>('.station-card')]
        .find((c) => c.dataset.station === focused)
        ?.focus();
  }

  return {
    prepare: renderOptions,
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
      renderOptions(state);
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
        sortedByDistance: visible.sortedByDistance,
        hasRoute: !!state.route,
        radiusKm: p.searchRadiusKm,
        favouritesOnly: state.favouritesOnly,
      });
    },
  };
}
