import { describe, expect, it } from 'vitest';
import { memoryStorageAdapter } from '../../src/storage/adapter';
import { createCache, removeKeysWithPrefix } from '../../src/storage/cache';

const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe('createCache', () => {
  it('stores and reads values under its namespace', () => {
    const storage = memoryStorageAdapter();
    const cache = createCache(storage, { namespace: 'ns:' });
    expect(cache.set('a', { x: 1 })).toBe(true);
    expect(cache.get('a')).toEqual({ x: 1 });
    expect(storage.keys()).toEqual(['ns:a']);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('expires entries after their TTL', () => {
    const c = clock();
    const cache = createCache(memoryStorageAdapter(), { namespace: 'ns:', now: c.now });
    cache.set('a', 1, { ttlMs: 1000 });
    c.advance(999);
    expect(cache.get('a')).toBe(1);
    c.advance(1);
    expect(cache.get('a')).toBeUndefined();
  });

  it('keeps entries without TTL forever', () => {
    const c = clock();
    const cache = createCache(memoryStorageAdapter(), { namespace: 'ns:', now: c.now });
    cache.set('a', 1);
    c.advance(10 ** 12);
    expect(cache.get('a')).toBe(1);
  });

  it('drops corrupted entries instead of throwing', () => {
    const storage = memoryStorageAdapter();
    storage.setItem('ns:a', '{not json');
    const cache = createCache(storage, { namespace: 'ns:' });
    expect(cache.get('a')).toBeUndefined();
    expect(storage.getItem('ns:a')).toBeNull();
  });

  it('evicts the oldest entries of its own namespace when storage is full', () => {
    const c = clock();
    const storage = memoryStorageAdapter(200);
    storage.setItem('other', 'x'.repeat(20)); // not ours: must survive
    const cache = createCache(storage, { namespace: 'ns:', now: c.now });

    cache.set('old', 'a'.repeat(40));
    c.advance(1);
    cache.set('mid', 'b'.repeat(40));
    c.advance(1);
    expect(cache.set('new', 'c'.repeat(60))).toBe(true);

    expect(cache.get('old')).toBeUndefined();
    expect(cache.get('mid')).toBe('b'.repeat(40));
    expect(cache.get('new')).toBe('c'.repeat(60));
    expect(storage.getItem('other')).toBe('x'.repeat(20));
  });

  it('returns false when a value cannot fit even after evicting everything', () => {
    const cache = createCache(memoryStorageAdapter(50), { namespace: 'ns:' });
    cache.set('small', 1);
    expect(cache.set('huge', 'z'.repeat(500))).toBe(false);
    expect(cache.get('huge')).toBeUndefined();
  });

  it('purgeExpired removes only expired and unreadable entries', () => {
    const c = clock();
    const storage = memoryStorageAdapter();
    const cache = createCache(storage, { namespace: 'ns:', now: c.now });
    cache.set('short', 1, { ttlMs: 10 });
    cache.set('long', 2, { ttlMs: 10_000 });
    storage.setItem('ns:broken', '???');
    c.advance(20);
    expect(cache.purgeExpired()).toBe(2);
    expect(cache.get('long')).toBe(2);
  });
});

describe('removeKeysWithPrefix', () => {
  it('removes only matching keys', () => {
    const storage = memoryStorageAdapter();
    for (const k of ['gasolineras_prov_28', 'gas_hist_28_20-11-2026', 'gasolineras_prefs', 'other'])
      storage.setItem(k, '1');
    expect(removeKeysWithPrefix(storage, ['gasolineras_prov_', 'gas_hist_'])).toBe(2);
    expect(storage.keys().sort()).toEqual(['gasolineras_prefs', 'other']);
  });
});
