import { HTTP_LOGGER_OPTIONS } from './http-logger';

describe('HTTP logger privacy policy', () => {
  it('never auto-logs deployment heartbeat requests', () => {
    expect(HTTP_LOGGER_OPTIONS.autoLogging.ignore({ url: '/api/telemetry/heartbeat' })).toBe(true);
    expect(HTTP_LOGGER_OPTIONS.autoLogging.ignore({ url: '/api/telemetry/heartbeat?retry=1' })).toBe(true);
    expect(HTTP_LOGGER_OPTIONS.autoLogging.ignore({ url: '/api/telemetry/summary' })).toBe(false);
    expect(HTTP_LOGGER_OPTIONS.autoLogging.ignore({})).toBe(false);
  });

  it('redacts authentication, session, telemetry-admin, and response-cookie secrets', () => {
    expect(HTTP_LOGGER_OPTIONS.redact.censor).toBe('[Redacted]');
    expect(HTTP_LOGGER_OPTIONS.redact.paths).toEqual(expect.arrayContaining([
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-telemetry-admin-token"]',
      'res.headers["set-cookie"]',
    ]));
  });
});
