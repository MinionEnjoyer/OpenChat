import { z } from 'zod';

/**
 * Validates process.env at boot. Wired via ConfigModule.forRoot({ validate }).
 * Keys stay FLAT (e.g. REDIS_URL) so services read them with ConfigService.get('REDIS_URL').
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  WEB_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  OIDC_ISSUER: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REDIRECT_URI: z.string().url(),
  // Native PKCE redirect URI for mobile apps (FR-AUTH-001). Defaults to the
  // registered deep-link scheme. Not required — the server falls back.
  NATIVE_REDIRECT_URI: z.string().optional().default('openchat://auth'),
  OIDC_POST_LOGOUT_REDIRECT_URI: z.string().url(),
  // Share is optional — without it the platform runs as text + voice (no file/image
  // uploads or custom avatars). The frontend hides upload UI when it's unset.
  SHARE_BASE_URL: z.string().url().optional(),
  SHARE_API_KEY: z.string().optional(),
  // Upload limits are opt-in for self-hosted deployments. Unset means unlimited.
  UPLOAD_MAX_FILES: z.coerce.number().int().positive().optional(),
  UPLOAD_MAX_FILE_BYTES: z.coerce.number().int().positive().optional(),
  WS_MAX_PAYLOAD_BYTES: z.coerce.number().int().positive().default(1_048_576),
  WS_MAX_SOCKETS_PER_USER: z.coerce.number().int().positive().default(10),
  WS_MAX_SUBSCRIPTIONS: z.coerce.number().int().positive().default(500),
  WS_MAX_OPERATIONS_PER_WINDOW: z.coerce.number().int().positive().default(120),
  WS_OPERATION_WINDOW_MS: z.coerce.number().int().positive().default(10_000),
  WS_MAX_BUFFERED_BYTES: z.coerce.number().int().positive().default(1_048_576),
  JELLYFIN_URL: z.string().url(),
  JELLYFIN_API_KEY: z.string().optional(),
  LIVEKIT_URL: z.string().min(1),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  // HTTP URL of the LiveKit server API (e.g. http://<host>:7880). Optional — used to read
  // the live voice roster so ghost participants self-heal; falls back to DB tracking if unset.
  LIVEKIT_API_URL: z.string().url().optional(),
  // GIF search via Giphy. Optional — the GIF picker degrades gracefully if unset.
  GIPHY_API_KEY: z.string().optional(),
  // Push notifications via Firebase Cloud Messaging. Optional — when absent push is
  // silently disabled via NoopPushTransport. VALIDATED HERE so a typo or missing key
  // fails at boot rather than degrading to no-push at runtime.
  FCM_SERVICE_ACCOUNT: z.string().optional(),
  JWT_SECRET: z.string().min(1),
  ENABLE_API_DOCS: z.enum(['0', '1']).optional().default('0'),
  // Trusted, operator-managed active-active mirror cluster. Disabled by default.
  FEDERATION_ENABLED: z.enum(['0', '1']).optional().default('0'),
  FEDERATION_NODE_ID: z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/).optional(),
  FEDERATION_SHARED_SECRET: z.string().min(32).optional(),
  FEDERATION_PEERS: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.SHARE_BASE_URL && !env.SHARE_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SHARE_API_KEY'],
      message: 'SHARE_API_KEY is required when SHARE_BASE_URL is configured',
    });
  }
  if (env.FEDERATION_ENABLED === '1') {
    if (!env.FEDERATION_NODE_ID) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['FEDERATION_NODE_ID'], message: 'required when federation is enabled' });
    }
    if (!env.FEDERATION_SHARED_SECRET) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['FEDERATION_SHARED_SECRET'], message: 'required when federation is enabled' });
    }
    let peers: unknown;
    try { peers = JSON.parse(env.FEDERATION_PEERS ?? ''); } catch { peers = null; }
    const parsedPeers = z.array(z.object({
      id: z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/),
      url: z.string().url().refine((url) => new URL(url).protocol === 'https:', 'peer URL must use HTTPS'),
    })).min(1).safeParse(peers);
    if (!parsedPeers.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['FEDERATION_PEERS'], message: 'must be a non-empty JSON array of unique HTTPS peers' });
    } else {
      const ids = parsedPeers.data.map((peer) => peer.id);
      if (new Set(ids).size !== ids.length || ids.includes(env.FEDERATION_NODE_ID ?? '')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['FEDERATION_PEERS'], message: 'peer IDs must be unique and cannot match this node' });
      }
    }
  }
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      'Invalid environment configuration:\n' +
        JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
    );
  }
  return parsed.data;
}
