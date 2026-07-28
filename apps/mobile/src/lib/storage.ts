/**
 * Storage — key/value persistence behind a swappable backend (06 §1, §6).
 *
 * The MMKV backend is loaded lazily so unit tests can use the in-memory backend
 * without pulling in a native module. Persisted scope is bounded by 06 §6 — do
 * not widen what gets written here without a Decision Record.
 */

export interface StorageBackend {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  getAllKeys(): string[];
}

export function createMemoryBackend(): StorageBackend {
  const map = new Map<string, string>();
  return {
    getString: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
    delete: (key) => {
      map.delete(key);
    },
    getAllKeys: () => [...map.keys()],
  };
}

/**
 * Native MMKV backend. Required lazily: importing react-native-mmkv at module
 * scope would make every unit test that touches storage need a native mock.
 */
export function createMmkvBackend(id = 'openchat'): StorageBackend {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
  const mmkv = new MMKV({ id });
  return {
    getString: (key) => mmkv.getString(key),
    set: (key, value) => mmkv.set(key, value),
    delete: (key) => mmkv.delete(key),
    getAllKeys: () => mmkv.getAllKeys(),
  };
}

export class Storage {
  constructor(private backend: StorageBackend) {}

  /**
   * Reads and parses a JSON value. Corrupt entries resolve to undefined and are
   * dropped rather than thrown: a persisted cache is a convenience, and a bad
   * entry must never keep the app from starting.
   */
  getJson<T>(key: string): T | undefined {
    const raw = this.backend.getString(key);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.backend.delete(key);
      return undefined;
    }
  }

  setJson(key: string, value: unknown): void {
    this.backend.set(key, JSON.stringify(value));
  }

  remove(key: string): void {
    this.backend.delete(key);
  }

  keys(): string[] {
    return this.backend.getAllKeys();
  }
}
