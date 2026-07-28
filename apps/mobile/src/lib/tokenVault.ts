/**
 * Token vault — secure at-rest storage for the bearer token pair (FR-AUTH-003).
 * Keychain on iOS, Keystore-backed EncryptedSharedPreferences on Android.
 *
 * expo-secure-store is required lazily so unit tests can inject a memory vault
 * without mocking a native module.
 */
import type { TokenPair } from '../api/client';

export interface TokenVault {
  load(): Promise<TokenPair | null>;
  save(tokens: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'openchat.tokens';

export function createSecureVault(): TokenVault {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
  return {
    async load() {
      const raw = await SecureStore.getItemAsync(KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as TokenPair;
        return parsed.accessToken && parsed.refreshToken ? parsed : null;
      } catch {
        await SecureStore.deleteItemAsync(KEY);
        return null;
      }
    },
    async save(tokens) {
      await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
    },
    async clear() {
      await SecureStore.deleteItemAsync(KEY);
    },
  };
}

export function createMemoryVault(): TokenVault {
  let stored: TokenPair | null = null;
  return {
    load: async () => stored,
    save: async (t) => {
      stored = t;
    },
    clear: async () => {
      stored = null;
    },
  };
}
