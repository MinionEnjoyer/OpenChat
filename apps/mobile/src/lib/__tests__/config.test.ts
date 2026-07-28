import { ANDROID_EMULATOR_HOST, ConfigError, DEFAULT_DEV_CONFIG, resolveConfig } from '../config';

describe('config', () => {
  it('falls back to the emulator-reachable dev defaults', () => {
    const cfg = resolveConfig();
    expect(cfg).toEqual(DEFAULT_DEV_CONFIG);
    // 10.0.2.2 is the host loopback as seen from an Android emulator (P0-15).
    expect(cfg.apiBaseUrl).toContain(ANDROID_EMULATOR_HOST);
  });

  it('keeps the /api global prefix in the default base URL', () => {
    expect(resolveConfig().apiBaseUrl.endsWith('/api')).toBe(true);
  });

  it('strips trailing slashes so joined paths do not double up', () => {
    const cfg = resolveConfig({ apiBaseUrl: 'http://example.test:3001/api/', wsUrl: 'ws://example.test:3001/ws//' });
    expect(cfg.apiBaseUrl).toBe('http://example.test:3001/api');
    expect(cfg.wsUrl).toBe('ws://example.test:3001/ws');
  });

  it('rejects a non-http api base URL', () => {
    expect(() => resolveConfig({ apiBaseUrl: 'example.test/api' })).toThrow(ConfigError);
  });

  it('rejects a non-ws gateway URL', () => {
    expect(() => resolveConfig({ wsUrl: 'http://example.test/ws' })).toThrow(ConfigError);
  });

  it('names the offending field in the error', () => {
    expect(() => resolveConfig({ apiBaseUrl: 42 })).toThrow(/apiBaseUrl/);
  });

  it('accepts the e2e flag as a boolean or the string "true"', () => {
    expect(resolveConfig({ e2e: true }).e2e).toBe(true);
    expect(resolveConfig({ e2e: 'true' }).e2e).toBe(true);
    expect(resolveConfig({ e2e: 'false' }).e2e).toBe(false);
    expect(resolveConfig().e2e).toBe(false);
  });
});
