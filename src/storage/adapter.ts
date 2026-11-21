/**
 * Minimal key/value storage interface.
 *
 * The app talks to this instead of `localStorage` directly, so the backing store
 * can change (IndexedDB, Capacitor Preferences on mobile, memory in tests).
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  /** May throw when the storage is full (quota exceeded). */
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

/**
 * Browser `localStorage`. Reads and removals never throw (some browsers block
 * storage entirely, e.g. in private mode); `setItem` still throws on quota errors
 * so callers can react.
 */
export function localStorageAdapter(storage: Storage | undefined = globalThis.localStorage): StorageAdapter {
  return {
    getItem(key) {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      if (!storage) throw new Error('Storage not available');
      storage.setItem(key, value);
    },
    removeItem(key) {
      try {
        storage?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
    keys() {
      try {
        return storage ? Object.keys(storage) : [];
      } catch {
        return [];
      }
    },
  };
}

/**
 * In-memory storage, for tests and as a fallback.
 * `quotaChars` simulates a full disk: writes that would exceed it throw like the browser does.
 */
export function memoryStorageAdapter(quotaChars = Infinity): StorageAdapter & { usedChars(): number } {
  const data = new Map<string, string>();
  const used = () => [...data].reduce((sum, [k, v]) => sum + k.length + v.length, 0);

  return {
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      const previous = data.get(key);
      const next =
        used() - (previous !== undefined ? key.length + previous.length : 0) + key.length + value.length;
      if (next > quotaChars) {
        const error = new Error('Quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }
      data.set(key, value);
    },
    removeItem: (key) => void data.delete(key),
    keys: () => [...data.keys()],
    usedChars: used,
  };
}
