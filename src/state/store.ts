export type Listener<S> = (state: S, previous: S) => void;

export interface Store<S> {
  getState(): S;
  /**
   * Replaces the state with `fn(current)`. Listeners run synchronously, once per
   * update, and only if `fn` returned a different object.
   */
  update(fn: (state: S) => S): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: Listener<S>): () => void;
}

/** A minimal immutable-state store: the only way state changes is through `update`. */
export function createStore<S>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<Listener<S>>();

  return {
    getState: () => state,
    update(fn) {
      const previous = state;
      const next = fn(previous);
      if (next === previous) return;
      state = next;
      for (const listener of [...listeners]) listener(next, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
