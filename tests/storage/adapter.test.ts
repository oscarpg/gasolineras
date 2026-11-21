import { describe, expect, it } from 'vitest';
import { localStorageAdapter } from '../../src/storage/adapter';

/** Behaves like window.localStorage: items are own enumerable properties, methods live on the prototype. */
class FakeStorage {
  [key: string]: unknown;
  getItem(key: string) {
    return Object.prototype.hasOwnProperty.call(this, key) ? String(this[key]) : null;
  }
  setItem(key: string, value: string) {
    this[key] = value;
  }
  removeItem(key: string) {
    delete this[key];
  }
}

/** A storage that throws on every access, like a browser with storage blocked. */
const blocked = new Proxy(
  {},
  {
    get() {
      throw new Error('SecurityError');
    },
    ownKeys() {
      throw new Error('SecurityError');
    },
  },
) as Storage;

describe('localStorageAdapter', () => {
  it('reads, writes, lists and removes keys', () => {
    const storage = localStorageAdapter(new FakeStorage() as unknown as Storage);
    storage.setItem('a', '1');
    storage.setItem('b', '2');
    expect(storage.getItem('a')).toBe('1');
    expect(storage.getItem('missing')).toBeNull();
    expect(storage.keys().sort()).toEqual(['a', 'b']);
    storage.removeItem('a');
    expect(storage.keys()).toEqual(['b']);
  });

  it('never throws on reads/removals when storage is blocked; writes throw so callers can react', () => {
    const storage = localStorageAdapter(blocked);
    expect(storage.getItem('a')).toBeNull();
    expect(storage.keys()).toEqual([]);
    storage.removeItem('a');
    expect(() => storage.setItem('a', '1')).toThrow('SecurityError');
  });
});
