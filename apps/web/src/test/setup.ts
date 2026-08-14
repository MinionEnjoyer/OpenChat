import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node 26 exposes an unavailable experimental localStorage unless a backing file
// is configured. Vitest's jsdom environment should remain hermetic, so install a
// small in-memory Storage implementation instead of sharing process state.
const values = new Map<string, string>();
const testStorage: Storage = {
  get length() { return values.size; },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => { values.delete(key); },
  setItem: (key, value) => { values.set(key, String(value)); },
};
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: testStorage });
Object.defineProperty(window, 'localStorage', { configurable: true, value: testStorage });

afterEach(() => {
  cleanup();
  testStorage.clear();
});
