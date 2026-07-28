import { Platform } from 'react-native';

import {
  ANDROID_EMULATOR_HOST,
  ConfigError,
  DEFAULT_DEV_CONFIG,
  IOS_SIMULATOR_HOST,
  resolveConfig,
} from '../config';

describe('config', () => {
  it('falls back to a host the CURRENT platform can actually reach', () => {
    const cfg = resolveConfig();
    expect(cfg).toEqual(DEFAULT_DEV_CONFIG);
    // The default is platform-dependent and must be, because the two aliases are
    // not interchangeable: 10.0.2.2 is invented by the Android emulator's NAT and
    // does not resolve on iOS, where the simulator shares the host network and
    // reaches it at plain localhost.
    //
    // This test previously asserted 10.0.2.2 unconditionally, which passed only
    // because Android was the only platform. The first iOS build then dialled
    // 10.0.2.2, hung on a spinner, and reported "auth failed" — a defect this
    // assertion should have caught and could not, because it encoded the
    // assumption it was meant to check.
    const expected = Platform.OS === 'ios' ? IOS_SIMULATOR_HOST : ANDROID_EMULATOR_HOST;
    expect(cfg.apiBaseUrl).toContain(expected);
    expect(cfg.apiBaseUrl).not.toContain(
      Platform.OS === 'ios' ? ANDROID_EMULATOR_HOST : IOS_SIMULATOR_HOST,
    );
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
