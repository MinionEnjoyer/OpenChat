/**
 * Config — typed build/runtime configuration (06 §5).
 *
 * This is the *client* config: where the backend lives and which harness mode
 * we are in. The server-provided config (`GET /api/config`, feature flags for
 * giphy/share) is fetched at boot in Phase 1 and is deliberately not here.
 */

export interface AppConfig {
  /** Base URL including the `/api` global prefix (00 §0.3). */
  apiBaseUrl: string;
  /** Gateway origin; the ticket is appended at connect time (`/ws?ticket=`). */
  wsUrl: string;
  /** True when running under an E2E harness: freezes the clock, disables animations. */
  e2e: boolean;
}

/**
 * An Android emulator reaches the host's published ports at 10.0.2.2 — proven
 * on-device in P0-15 (`artifacts/e2e/net-probe.json`), not assumed.
 */
export const ANDROID_EMULATOR_HOST = '10.0.2.2';

/**
 * Host the app talks to. Defaults to the emulator alias above.
 *
 * A PHYSICAL device cannot reach 10.0.2.2 (emulator-only) or localhost (its own
 * loopback), so device builds must point at the dev machine's LAN address. Set
 * EXPO_PUBLIC_API_HOST at build time — Expo inlines EXPO_PUBLIC_* at bundle time:
 *
 *   EXPO_PUBLIC_API_HOST=192.168.1.100 npm run apk:release
 *
 * For E2E builds, also enable the dev-login UI (compile-time gated, see
 * LoginScreen.tsx and P1-04):
 *
 *   EXPO_PUBLIC_ENABLE_DEV_LOGIN=true EXPO_PUBLIC_API_HOST=10.0.2.2 npm run apk:release
 *
 * Deliberately NOT hardcoded: a LAN IP baked into committed config breaks the
 * moment DHCP reassigns it, and breaks other machines and CI immediately.
 */
export const API_HOST = process.env.EXPO_PUBLIC_API_HOST ?? ANDROID_EMULATOR_HOST;

export const DEFAULT_DEV_CONFIG: AppConfig = {
  apiBaseUrl: `http://${API_HOST}:3030/api`,
  wsUrl: `ws://${API_HOST}:3030/ws`,
  e2e: false,
};

export class ConfigError extends Error {}

/**
 * Return the resolved API base URL.
 * 
 * In tests, `configureSession` may override the session's config;
 * this function returns the module-level resolved config which
 * defaults to `DEFAULT_DEV_CONFIG.apiBaseUrl`.
 * 
 * For the production path, the session store's config override
 * (set via `configureSession`) is authoritative — but `AuthImage`
 * can accept an explicit `baseUrl` prop for that scenario.
 */
export function getApiBaseUrl(): string {
  return resolveConfig().apiBaseUrl;
}

/**
 * Builds config from raw values, failing loudly on anything malformed. A
 * silently-wrong base URL surfaces later as an unexplained network error, which
 * is far more expensive to diagnose than a startup crash naming the field.
 */
export function resolveConfig(raw: Partial<Record<keyof AppConfig, unknown>> = {}): AppConfig {
  const apiBaseUrl = raw.apiBaseUrl ?? DEFAULT_DEV_CONFIG.apiBaseUrl;
  const wsUrl = raw.wsUrl ?? DEFAULT_DEV_CONFIG.wsUrl;

  if (typeof apiBaseUrl !== 'string' || !/^https?:\/\//.test(apiBaseUrl)) {
    throw new ConfigError(`apiBaseUrl must be an http(s) URL, got: ${String(apiBaseUrl)}`);
  }
  if (typeof wsUrl !== 'string' || !/^wss?:\/\//.test(wsUrl)) {
    throw new ConfigError(`wsUrl must be a ws(s) URL, got: ${String(wsUrl)}`);
  }

  return {
    // Trailing slashes make every joined path double-slashed; normalize once here.
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    wsUrl: wsUrl.replace(/\/+$/, ''),
    e2e: raw.e2e === true || raw.e2e === 'true',
  };
}
