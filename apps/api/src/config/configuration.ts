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
  OIDC_POST_LOGOUT_REDIRECT_URI: z.string().url(),
  // Share is optional — without it the platform runs as text + voice (no file/image
  // uploads or custom avatars). The frontend hides upload UI when it's unset.
  SHARE_BASE_URL: z.string().url().optional(),
  SHARE_API_KEY: z.string().optional(),
  JELLYFIN_URL: z.string().url(),
  JELLYFIN_API_KEY: z.string().optional(),
  LIVEKIT_URL: z.string().min(1),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  // GIF search via Giphy. Optional — the GIF picker degrades gracefully if unset.
  GIPHY_API_KEY: z.string().optional(),
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
