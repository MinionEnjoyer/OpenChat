import { z } from 'zod';

export const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const TELEMETRY_COLLECTOR_URL = 'https://chat.creeger.com/api/telemetry/heartbeat';

export const TelemetryHeartbeatSchema = z.object({
  product: z.enum(['openchat', 'openshare']),
  installId: z.string().uuid(),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/).max(64),
  deploymentType: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
}).strict();

export type TelemetryHeartbeat = z.infer<typeof TelemetryHeartbeatSchema>;
