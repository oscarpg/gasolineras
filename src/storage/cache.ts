import type { StorageAdapter } from './adapter';

export interface CacheSetOptions {
  /** Time to live in milliseconds. Omit for "until evicted". */
  ttlMs?: number;
}

export interface Cache {
  get<T>(key: string): T | undefined;
  /** Returns false if the value couldn't be stored even after evicting everything else in the cache. */
  set<T>(key: string, value: T, options?: CacheSetOptions): boolean;
  delete(key: string): void;
  /** Removes expired entries; returns how many were removed. */
  purgeExpired(): number;
}

interface Entry<T> {
  /** value */
  v: T;
  /** expires at (ms since epoch), or null */
  e: number | null;
  /** written at (ms since epoch), used to evict the oldest entries first */
  w: number;
}

export interface CacheOptions {
  /** Prefix for every key, including a version so the format can change safely. */
  namespace: string;
  now?: () => number;
}

/**
 * JSON cache on top of a StorageAdapter, with expiry and eviction.
 *
 * When the storage is full, the oldest entries of this cache are removed one by
 * one until the new value fits. Entries outside the namespace are never touched.
 */
export function createCache(storage: StorageAdapter, { namespace, now = Date.now }: CacheOptions): Cache {
  const fullKey = (key: string) => namespace + key;

  const read = <T>(storageKey: string): Entry<T> | undefined => {
    const raw = storage.getItem(storageKey);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw) as Entry<T>;
    } catch {
      storage.removeItem(storageKey);
      return undefined;
    }
  };

  const isExpired = (entry: Entry<unknown>) => entry.e !== null && entry.e <= now();

  const ownKeys = () => storage.keys().filter((k) => k.startsWith(namespace));

  const evictOldest = (except: string): boolean => {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const key of ownKeys()) {
      if (key === except) continue;
      const entry = read(key);
      const time = entry?.w ?? -Infinity; // unreadable entries go first
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    if (oldestKey === null) return false;
    storage.removeItem(oldestKey);
    return true;
  };

  return {
    get<T>(key: string) {
      const storageKey = fullKey(key);
      const entry = read<T>(storageKey);
      if (!entry) return undefined;
      if (isExpired(entry)) {
        storage.removeItem(storageKey);
        return undefined;
      }
      return entry.v;
    },

    set<T>(key: string, value: T, { ttlMs }: CacheSetOptions = {}) {
      const storageKey = fullKey(key);
      const t = now();
      const serialized = JSON.stringify({
        v: value,
        e: ttlMs != null ? t + ttlMs : null,
        w: t,
      } satisfies Entry<T>);

      for (;;) {
        try {
          storage.setItem(storageKey, serialized);
          return true;
        } catch {
          if (!evictOldest(storageKey)) return false;
        }
      }
    },

    delete(key) {
      storage.removeItem(fullKey(key));
    },

    purgeExpired() {
      let removed = 0;
      for (const key of ownKeys()) {
        const entry = read(key);
        if (!entry || isExpired(entry)) {
          storage.removeItem(key);
          removed++;
        }
      }
      return removed;
    },
  };
}

/** Deletes every key starting with one of the prefixes (used to clean up old cache formats). */
export function removeKeysWithPrefix(storage: StorageAdapter, prefixes: readonly string[]): number {
  let removed = 0;
  for (const key of storage.keys()) {
    if (prefixes.some((p) => key.startsWith(p))) {
      storage.removeItem(key);
      removed++;
    }
  }
  return removed;
}
