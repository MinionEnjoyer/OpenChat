/**
 * Session store (06 §1): auth lifecycle for the whole app.
 *
 *   restoring → signedIn   (vault had tokens and /auth/me accepted them — FR-AUTH-003)
 *   restoring → signedOut  (no tokens, or they no longer authenticate)
 *   signedIn  → signedOut  (logout FR-AUTH-004, or hard-logout broadcast FR-AUTH-010)
 */
import { create } from 'zustand';
import { ApiClient, type TokenPair } from '../api/client';
import { createSecureVault, type TokenVault } from '../lib/tokenVault';
import { resolveConfig, type AppConfig } from '../lib/config';
import { logger } from '../lib/logger';
import { fetchOidcMetadata, generatePkcePair, authorizeViaBrowser } from '../lib/pkce';
import type { User } from '../api/schema';

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  user: User | null;
  tokens: TokenPair | null;
  restore(): Promise<void>;
  devLogin(username: string): Promise<void>;
  loginWithPkce(): Promise<void>;
  logout(): Promise<void>;
  updateProfile(patch: { username?: string; displayName?: string; status?: string }): Promise<void>;
}

// Module-level singletons wired once; tests re-wire via configureSession.
let vault: TokenVault = createSecureVault();
let config: AppConfig = resolveConfig();

export function configureSession(overrides: { vault?: TokenVault; config?: AppConfig }): void {
  if (overrides.vault) vault = overrides.vault;
  if (overrides.config) config = overrides.config;
}

// ── Logout hook for features that need to tear down before sign-out (FR-NOTIF-002) ──

let _logoutHook: (() => Promise<void>) | null = null;

/** Register a hook that runs BEFORE session clear on logout. Registered by push token lifecycle. */
export function setLogoutHook(hook: (() => Promise<void>) | null): void {
  _logoutHook = hook;
}

export const api = new ApiClient({
  get baseUrl() {
    return config.apiBaseUrl;
  },
  getTokens: () => useSession.getState().tokens,
  setTokens: async (tokens) => {
    useSession.setState({ tokens });
    await vault.save(tokens);
  },
  onHardLogout: () => {
    void _logoutHook?.();
    // FR-AUTH-010: refresh failed for good — clear state, land on login.
    logger.warn('hard logout: refresh failed');
    void vault.clear();
    useSession.setState({ status: 'signedOut', user: null, tokens: null });
  },
});

export const useSession = create<SessionState>((set, get) => ({
  status: 'restoring',
  user: null,
  tokens: null,

  async restore() {
    const stored = await vault.load();
    if (!stored) {
      set({ status: 'signedOut' });
      return;
    }
    set({ tokens: stored });
    try {
      const user = await api.request<User>('/auth/me');
      set({ status: 'signedIn', user });
    } catch {
      // api's interceptor already tried a refresh; if we're still here, sign out.
      set({ status: 'signedOut', user: null, tokens: null });
      await vault.clear();
    }
  },

  async devLogin(username: string) {
    const body = await api.request<User & TokenPair>('/auth/dev-login', {
      method: 'POST',
      body: { username },
    });
    const tokens: TokenPair = { accessToken: body.accessToken, refreshToken: body.refreshToken };
    await vault.save(tokens);
    const { accessToken, refreshToken, ...user } = body;
    set({ status: 'signedIn', user: user as unknown as User, tokens });
  },

  async loginWithPkce() {
    const baseUrl = config.apiBaseUrl;
    const metadata = await fetchOidcMetadata(baseUrl);
    const { codeVerifier, codeChallenge } = await generatePkcePair();
    const result = await authorizeViaBrowser(baseUrl, metadata, codeVerifier, codeChallenge);

    const tokens = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
    await vault.save(tokens);
    set({ status: 'signedIn', user: result.user, tokens });
  },
  async logout() {
    const { tokens } = get();
    if (_logoutHook) await _logoutHook();
    try {
      if (tokens) {
        await api.request('/auth/logout', { method: 'POST', body: { refreshToken: tokens.refreshToken } });
      }
    } catch {
      // Revocation is best-effort; local teardown happens regardless.
    }
    await vault.clear();
    set({ status: 'signedOut', user: null, tokens: null });
  },

  async updateProfile(patch) {
    const prev = get().user;
    if (!prev) return;
    // FR-AUTH-006 optimistic update; caller shows the FR-APP-006 toast on throw.
    set({ user: { ...prev, ...patch } as User });
    try {
      const updated = await api.request<User>('/auth/me', { method: 'PATCH', body: patch });
      set({ user: updated });
    } catch (e) {
      set({ user: prev });
      throw e;
    }
  },
}));
