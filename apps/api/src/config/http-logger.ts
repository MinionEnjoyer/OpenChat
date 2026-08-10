/**
 * Shared HTTP logger policy. Keeping this policy exported makes accidental
 * credential logging and heartbeat request logging directly regression-testable.
 */
export const HTTP_LOGGER_OPTIONS = {
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-telemetry-admin-token"]',
      'res.headers["set-cookie"]',
    ],
    censor: '[Redacted]',
  },
  // Heartbeat bodies and request addresses are deliberately absent from
  // application logs; aggregate fields are persisted by TelemetryService.
  autoLogging: {
    ignore: (request: { url?: string }) =>
      request.url?.startsWith('/api/telemetry/heartbeat') ?? false,
  },
};
