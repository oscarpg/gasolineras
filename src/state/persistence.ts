import type { Preferences } from '../domain/preferences';
import type { AppState } from './appState';
import type { Store } from './store';

export interface PersistOptions {
  /** Wait this long after the last change before saving (sliders change many times a second). */
  delayMs?: number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/**
 * Saves preferences whenever they change, debounced. Rendering never saves.
 * Call `flush()` when the page is being hidden so the last change isn't lost.
 */
export function persistPreferences(
  store: Store<AppState>,
  save: (preferences: Preferences) => void,
  {
    delayMs = 300,
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancel = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  }: PersistOptions = {},
) {
  let timer: unknown = null;
  let pending: Preferences | null = null;

  const flush = () => {
    if (timer !== null) cancel(timer);
    timer = null;
    if (pending) {
      const toSave = pending;
      pending = null;
      save(toSave);
    }
  };

  const unsubscribe = store.subscribe((state, previous) => {
    if (state.preferences === previous.preferences) return;
    pending = state.preferences;
    if (timer !== null) cancel(timer);
    timer = schedule(flush, delayMs);
  });

  return {
    flush,
    stop() {
      flush();
      unsubscribe();
    },
  };
}
