/**
 * Async work that reads services and writes the store: loading provinces and
 * checking price history. UI code calls these; they never touch the DOM.
 */
import { requiredHistoryDays } from '../domain/ageFilter';
import { daysBefore, toMitecoDate } from '../domain/dates';
import { computeProvinceStaleness, type HistoryWindowDay } from '../domain/staleness';
import type { MitecoService } from '../services/miteco';
import type { AppState } from './appState';
import { selectAgeFilter } from './selectors';
import type { Store } from './store';
import { addStations, finishHistoryJob, markProvinceLoaded, startHistoryJob } from './transitions';

export interface EffectsContext {
  store: Store<AppState>;
  miteco: Pick<MitecoService, 'getProvinceStations' | 'getHistoryDay'>;
  now?: () => Date;
}

export interface Effects {
  /**
   * Loads a province's stations into the store (replacing existing ones when `force`),
   * then starts the history check the current age filter needs. Throws if the download fails.
   */
  loadProvince(province: string, options?: { force?: boolean }): Promise<void>;
  /** Compares today's prices with the last `days` days and stores how long each price has been unchanged. */
  checkHistory(province: string, days: number): Promise<void>;
  /** Runs deeper history checks where the current age filter needs more days than were checked. */
  ensureHistoryForFilter(): Promise<void>;
}

export function createEffects({ store, miteco, now = () => new Date() }: EffectsContext): Effects {
  let nextJobId = 1;

  const requiredDays = () => requiredHistoryDays(selectAgeFilter(store.getState().preferences));

  async function checkHistory(province: string, days: number) {
    const today = now();
    const window: HistoryWindowDay[] = Array.from({ length: days }, (_, i) => ({
      daysAgo: i + 1,
      date: toMitecoDate(daysBefore(today, i + 1)),
    }));

    const id = nextJobId++;
    store.update((s) => startHistoryJob(s, id, { province, days }));
    try {
      // A missing day only shortens the comparison; it doesn't fail the check.
      const history = await Promise.all(
        window.map((d) => miteco.getHistoryDay(province, d.date).catch(() => null)),
      );
      const stations = store.getState().stations.filter((s) => s.provinceCode === province);
      const result = computeProvinceStaleness(stations, window, history, toMitecoDate(today));
      store.update((s) => finishHistoryJob(s, id, result));
    } catch (error) {
      console.warn('Price history check failed:', error);
      store.update((s) => finishHistoryJob(s, id, null));
    }
  }

  return {
    async loadProvince(province, { force = false } = {}) {
      const stations = await miteco.getProvinceStations(province, { force });
      store.update((s) => addStations(markProvinceLoaded(s, province), stations, { replace: force }));
      void checkHistory(province, requiredDays());
    },

    checkHistory,

    async ensureHistoryForFilter() {
      const needed = requiredDays();
      for (const province of store.getState().loadedProvinces) {
        const { historyDepth, historyJobs } = store.getState();
        const covered = Math.max(
          historyDepth[province] ?? 0,
          ...Object.values(historyJobs)
            .filter((j) => j.province === province)
            .map((j) => j.days),
        );
        if (needed > covered) await checkHistory(province, needed);
      }
    },
  };
}
