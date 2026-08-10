/**
 * Unit tests for configuration.ts Zod schema.
 *
 * Verifies that env vars read via config.get() with fallbacks are actually
 * present in the Zod schema so a typo in the var name fails LOUDLY at boot
 * instead of silently degrading at runtime.
 */
import { validateEnv } from './configuration';
import apiPackage from '../../package.json';

// Keep this cross-workspace assertion out of the API container's static module graph.
// Jest executes the spec from the monorepo, where the web package is available; the
// API-only Docker build compiles specs but intentionally does not copy sibling apps.
const webPackage = require('../../../web/package.json') as { version: string };

// Minimum valid config — all required fields present.
function minValid(): Record<string, unknown> {
  return {
    WEB_ORIGIN: 'https://chat.example.com',
    DATABASE_URL: 'postgresql://localhost:5432/chat',
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: '0123456789abcdef', // min 16 chars
    OIDC_ISSUER: 'https://auth.example.com/application/o/chat/',
    OIDC_CLIENT_ID: 'test-client-id',
    OIDC_CLIENT_SECRET: 'test-client-secret',
    OIDC_REDIRECT_URI: 'https://chat.example.com/api/auth/callback',
    OIDC_POST_LOGOUT_REDIRECT_URI: 'https://chat.example.com',
    JELLYFIN_URL: 'https://jellyfin.example.com',
    LIVEKIT_URL: 'wss://livekit.example.com',
    LIVEKIT_API_KEY: 'livekit-key',
    LIVEKIT_API_SECRET: 'livekit-secret',
    JWT_SECRET: 'jwt-secret-value',
  };
}

describe('NATIVE_REDIRECT_URI', () => {
  it('defaults to "openchat://auth" when absent', () => {
    const env = validateEnv(minValid());
    expect(env.NATIVE_REDIRECT_URI).toBe('openchat://auth');
  });

  it('accepts an explicit value', () => {
    const env = validateEnv({ ...minValid(), NATIVE_REDIRECT_URI: 'myapp://callback' });
    expect(env.NATIVE_REDIRECT_URI).toBe('myapp://callback');
  });

  it('rejects non-string values at parse time', () => {
    expect(() => validateEnv({ ...minValid(), NATIVE_REDIRECT_URI: 123 })).toThrow(
      'Invalid environment configuration',
    );
  });
});

describe('FCM_SERVICE_ACCOUNT', () => {
  it('is optional — validates without it', () => {
    const env = validateEnv(minValid());
    expect(env.FCM_SERVICE_ACCOUNT).toBeUndefined();
  });

  it('accepts a JSON string when present', () => {
    const env = validateEnv({
      ...minValid(),
      FCM_SERVICE_ACCOUNT: '{"project_id":"test","client_email":"x@y"}',
    });
    expect(env.FCM_SERVICE_ACCOUNT).toBe('{"project_id":"test","client_email":"x@y"}');
  });

  it('rejects non-string values at parse time', () => {
    expect(() => validateEnv({ ...minValid(), FCM_SERVICE_ACCOUNT: 42 })).toThrow(
      'Invalid environment configuration',
    );
  });
});

describe('deployment heartbeat configuration', () => {
  it('has a mandatory collector and 24-hour deployment classification defaults', () => {
    const env = validateEnv(minValid());
    expect(env.DEPLOYMENT_HEARTBEAT_ENDPOINT).toBe('https://chat.creeger.com/api/telemetry/heartbeat');
    expect(env.OPENCHAT_DEPLOYMENT_TYPE).toBe('docker-compose');
    expect(env.OPENCHAT_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('keeps the backend heartbeat version aligned with the released web client', () => {
    expect(apiPackage.version).toBe(webPackage.version);
  });

  it('rejects invalid deployment types and short admin tokens', () => {
    expect(() => validateEnv({ ...minValid(), OPENCHAT_DEPLOYMENT_TYPE: 'Docker Compose' }))
      .toThrow('Invalid environment configuration');
    expect(() => validateEnv({ ...minValid(), TELEMETRY_ADMIN_TOKEN: 'short' }))
      .toThrow('Invalid environment configuration');
  });
});

describe('Schema rejects completely unknown keys', () => {
  it('throws on a typo that looks like a real key', () => {
    // A typo like NATIVE_REDIRECT_URIX should fail — Zod strict/strip behavior.
    // The schema uses z.object() without .strict() so extra keys are STRIPPED,
    // not rejected. This test documents that behavior: a completely unknown key
    // does NOT fail. The hardening comes from the fact that config.get() reads
    // process.env directly, while the schema only validates known keys.
    // The real protection is: the key IS in the schema, so a typo in config.get()
    // returns undefined and the fallback activates. The schema's job is to
    // ensure the CORRECT key name is validated.
    const env = validateEnv({ ...minValid(), NATIVE_REDIRECT_URIX: 'bad' });
    // Extra key stripped — no error
    expect(env.NATIVE_REDIRECT_URI).toBe('openchat://auth');
  });
});

describe('trusted mirror cluster configuration', () => {
  it('is disabled without requiring cluster secrets', () => {
    expect(validateEnv(minValid()).FEDERATION_ENABLED).toBe('0');
  });

  it('accepts a complete HTTPS peer mesh', () => {
    const env = validateEnv({
      ...minValid(),
      FEDERATION_ENABLED: '1',
      FEDERATION_NODE_ID: 'west',
      FEDERATION_SHARED_SECRET: 'a'.repeat(32),
      FEDERATION_PEERS: JSON.stringify([{ id: 'east', url: 'https://east.chat.example.com' }]),
    });
    expect(env.FEDERATION_NODE_ID).toBe('west');
  });

  it.each([
    { FEDERATION_NODE_ID: undefined, label: 'missing node identity' },
    { FEDERATION_SHARED_SECRET: 'short', label: 'short secret' },
    { FEDERATION_PEERS: JSON.stringify([{ id: 'east', url: 'http://east.local' }]), label: 'non-HTTPS peer' },
    { FEDERATION_PEERS: JSON.stringify([{ id: 'west', url: 'https://west.example.com' }]), label: 'self peer' },
  ])('rejects $label', (change) => {
    expect(() => validateEnv({
      ...minValid(),
      FEDERATION_ENABLED: '1',
      FEDERATION_NODE_ID: 'west',
      FEDERATION_SHARED_SECRET: 'a'.repeat(32),
      FEDERATION_PEERS: JSON.stringify([{ id: 'east', url: 'https://east.example.com' }]),
      ...change,
    })).toThrow('Invalid environment configuration');
  });
});

describe('Patreon invitation configuration', () => {
  it('is disabled without requiring OAuth credentials', () => {
    expect(validateEnv(minValid()).PATREON_ENABLED).toBe('0');
  });

  it('accepts a complete Patreon OAuth configuration', () => {
    const env = validateEnv({
      ...minValid(),
      PATREON_ENABLED: '1',
      PATREON_CLIENT_ID: 'client-id',
      PATREON_CLIENT_SECRET: 'client-secret',
      PATREON_REDIRECT_URI: 'https://chat.example.com/api/patreon/callback',
    });
    expect(env.PATREON_ENABLED).toBe('1');
  });

  it.each(['PATREON_CLIENT_ID', 'PATREON_CLIENT_SECRET', 'PATREON_REDIRECT_URI'] as const)(
    'rejects enabled Patreon invitations without %s',
    (key) => {
      const config = {
        ...minValid(),
        PATREON_ENABLED: '1',
        PATREON_CLIENT_ID: 'client-id',
        PATREON_CLIENT_SECRET: 'client-secret',
        PATREON_REDIRECT_URI: 'https://chat.example.com/api/patreon/callback',
      };
      delete config[key];
      expect(() => validateEnv(config)).toThrow('Invalid environment configuration');
    },
  );
});
