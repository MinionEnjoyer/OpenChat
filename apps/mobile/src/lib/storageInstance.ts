/**
 * Shared Storage instance (06 §6).
 *
 * Defaults to MMKV for production. Tests call configureStorageInstance() with a
 * memory backend so they don't pull in the native module.
 */

import { Storage, createMemoryBackend, createMmkvBackend, type StorageBackend } from './storage';

let instance: Storage = new Storage(createMmkvBackend());

export function configureStorageInstance(backend: StorageBackend): void {
  instance = new Storage(backend);
}

/** Reset to a fresh memory backend — for tests. */
export function resetStorageInstance(): Storage {
  instance = new Storage(createMemoryBackend());
  return instance;
}

export const storage = (): Storage => instance;
