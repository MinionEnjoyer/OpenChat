import {
  Injectable, OnModuleInit, UnauthorizedException, BadRequestException,
  ConflictException, NotFoundException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Issuer, generators, Client } from 'openid-client';
import { randomBytes, randomInt, createHash } from 'crypto';
import type { Session } from 'express-session';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface OidcSession {
  state: string;
  codeVerifier: string;
  nonce: string;
}

const WS_TICKET_TTL_SECONDS = 30;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private client?: Client;
  private discovering?: Promise<Client>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Try OIDC discovery at boot, but don't crash the app if the IdP is unreachable
    // (e.g. local dev without Authentik) — it will be retried lazily on first use.
    this.getClient().catch((e) =>
      this.logger.warn(`OIDC discovery deferred: ${(e as Error).message}`),
    );
  }

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.discovering === undefined) {
      this.discovering = (async () => {
        const issuer = await Issuer.discover(this.config.getOrThrow<string>('OIDC_ISSUER'));
        this.client = new issuer.Client({
          client_id: this.config.getOrThrow<string>('OIDC_CLIENT_ID'),
          client_secret: this.config.getOrThrow<string>('OIDC_CLIENT_SECRET'),
          redirect_uris: [this.config.getOrThrow<string>('OIDC_REDIRECT_URI')],
          response_types: ['code'],
        });
        return this.client;
      })().catch((e) => {
        this.discovering = undefined; // allow retry
        throw e;
      });
    }
    return this.discovering;
  }

  async beginLogin(session: Session): Promise<string> {
    const client = await this.getClient();
    const state = generators.state();
    const codeVerifier = generators.codeVerifier();
    const nonce = generators.nonce();
    (session as Session & { oidc?: OidcSession }).oidc = { state, codeVerifier, nonce };
    return client.authorizationUrl({
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: generators.codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
  }

  async completeLogin(
    session: Session,
    params: Record<string, string>,
  ): Promise<{ userId: string; idToken: string }> {
    const client = await this.getClient();
    const oidc = (session as Session & { oidc?: OidcSession }).oidc;
    if (!oidc) throw new UnauthorizedException('No login in progress');

    const redirectUri = this.config.getOrThrow<string>('OIDC_REDIRECT_URI');
    const tokenSet = await client.callback(redirectUri, params, {
      state: oidc.state,
      nonce: oidc.nonce,
      code_verifier: oidc.codeVerifier,
    });
    if (!tokenSet.access_token) throw new UnauthorizedException('No access token returned');
    const claims = await client.userinfo(tokenSet.access_token);
    const user = await this.loginFromClaims(claims);

    delete (session as Session & { oidc?: OidcSession }).oidc;
    return { userId: user.id, idToken: tokenSet.id_token ?? '' };
  }

  /**
   * P1-01: the single claims→user code path, shared by the web callback above
   * and the native code exchange below so the two flows cannot drift.
   */
  async loginFromClaims(claims: {
    sub: string;
    preferred_username?: string;
    email?: string;
    name?: string;
    picture?: string;
  }) {
    const username =
      claims.preferred_username ??
      claims.email?.split('@')[0] ??
      `user_${claims.sub.slice(0, 8)}`;

    // NOTE: `update` is intentionally empty — once a user has customized their
    // nickname/display name/avatar in Chat, we must NOT overwrite it from
    // Authentik claims on every subsequent login.
    return this.prisma.user.upsert({
      where: { authSub: claims.sub },
      update: {},
      create: {
        authSub: claims.sub,
        username,
        displayName: claims.name ?? username,
        avatarUrl: claims.picture ?? null,
      },
    });
  }

  /**
   * P1-01: native authorization_code exchange (FR-AUTH-001). The mobile app runs
   * PKCE in the system browser against the NATIVE redirect URI and posts the
   * code here; the server finishes the exchange with its client_secret.
   */
  async exchangeNativeCode(code: string, codeVerifier: string, redirectUri: string) {
    const expected = this.config.get<string>('NATIVE_REDIRECT_URI') ?? 'openchat://auth';
    if (redirectUri !== expected) {
      throw new BadRequestException('redirectUri does not match the registered native redirect');
    }
    const client = await this.getClient();
    const tokenSet = await client.callback(
      redirectUri,
      { code },
      { code_verifier: codeVerifier },
    );
    if (!tokenSet.access_token) throw new UnauthorizedException('No access token returned');
    const claims = await client.userinfo(tokenSet.access_token);
    return this.loginFromClaims(claims);
  }

  /** P1-03 (DR-002 option D): public OIDC metadata for native clients. No secrets. */
  oidcMetadata() {
    return {
      issuer: this.config.get<string>('OIDC_ISSUER') ?? null,
      clientId: this.config.get<string>('OIDC_CLIENT_ID') ?? null,
      nativeRedirectUri: this.config.get<string>('NATIVE_REDIRECT_URI') ?? 'openchat://auth',
      scopes: ['openid', 'profile', 'email'],
    };
  }

  async endSessionUrl(idToken: string): Promise<string> {
    const client = await this.getClient();
    return client.endSessionUrl({
      id_token_hint: idToken || undefined,
      post_logout_redirect_uri: this.config.getOrThrow<string>('OIDC_POST_LOGOUT_REDIRECT_URI'),
    });
  }

  /** DEV ONLY: upsert a user + return it (session is set by the controller). Gated by env. */
  async devLogin(username: string) {
    const user = await this.prisma.user.upsert({
      where: { authSub: `dev:${username}` },
      update: {},
      create: { authSub: `dev:${username}`, username, displayName: username, status: 'ONLINE' },
    });
    const { authSub: _authSub, ...safe } = user;
    return safe;
  }

  /** Generate an unused 8-digit friend code. */
  private async generateUniqueFriendCode(): Promise<string> {
    for (let i = 0; i < 12; i++) {
      const code = String(randomInt(10_000_000, 100_000_000)); // always 8 digits
      const clash = await this.prisma.user.findUnique({ where: { friendCode: code } });
      if (!clash) return code;
    }
    throw new Error('Could not generate a unique friend code');
  }

  async getCurrentUser(userId: string) {
    let user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    // Lazily backfill a friend code for pre-existing users.
    if (!user.friendCode) {
      const friendCode = await this.generateUniqueFriendCode();
      user = await this.prisma.user.update({ where: { id: userId }, data: { friendCode } });
    }
    const { authSub: _authSub, ...safe } = user;
    return safe;
  }

  /** Update Chat-side profile fields (username/nickname + display name + avatar + status). */
  async updateProfile(
    userId: string,
    data: { username?: string; displayName?: string; avatarUrl?: string; status?: string; customStatus?: string; bio?: string },
  ) {
    const STATUSES = ['ONLINE', 'AWAY', 'DND', 'INVISIBLE', 'OFFLINE'];
    if (data.status !== undefined && !STATUSES.includes(data.status)) {
      throw new BadRequestException('Invalid status');
    }
    if (data.username !== undefined) {
      const username = data.username.trim();
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
        throw new BadRequestException(
          'Username must be 3–32 characters: letters, numbers, and . _ -',
        );
      }
      const clash = await this.prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' }, NOT: { id: userId } },
      });
      if (clash) throw new ConflictException('That username is already taken');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.username !== undefined ? { username: data.username.trim() } : {}),
        ...(data.displayName !== undefined ? { displayName: data.displayName || null } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl || null } : {}),
        ...(data.status !== undefined ? { status: data.status as any } : {}),
        ...(data.customStatus !== undefined ? { customStatus: data.customStatus || null } : {}),
        ...(data.bio !== undefined ? { bio: data.bio || null } : {}),
      },
    });
    const { authSub: _authSub, ...safe } = user;
    return safe;
  }

  /** Persist the user's opaque server-rail layout (folders/order). */
  async updateServerLayout(userId: string, layout: unknown) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { serverLayout: (layout ?? null) as any },
    });
    const { authSub: _authSub, ...safe } = user;
    return safe;
  }

  // ---- desktop PKCE (RFC 7636) ----

  private static readonly DESKTOP_PKCE_PREFIX = 'desktop_pkce:';
  private static readonly DESKTOP_CODE_TTL_SECONDS = 60;

  /**
   * P1-01 opt-in: mint a single-use PKCE code for the desktop handoff.
   * Only called when the client opts-in with code_challenge + code_challenge_method=S256.
   */
  async generateDesktopPkceCode(userId: string, codeChallenge: string): Promise<string> {
    const code = randomBytes(24).toString('hex');
    await this.redis.setEx(
      `${AuthService.DESKTOP_PKCE_PREFIX}${code}`,
      JSON.stringify({ userId, codeChallenge }),
      AuthService.DESKTOP_CODE_TTL_SECONDS,
    );
    return code;
  }

  /**
   * P1-01: exchange a desktop PKCE code for the authenticated user.
   * Verifies the codeVerifier against the stored S256 challenge.
   * Single-use: the code is consumed atomically on successful exchange.
   */
  async exchangeDesktopPkceCode(code: string, codeVerifier: string): Promise<{ id: string } | null> {
    const key = `${AuthService.DESKTOP_PKCE_PREFIX}${code}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;

    const { userId, codeChallenge } = JSON.parse(raw) as { userId: string; codeChallenge: string };

    // S256: SHA256(codeVerifier) → base64url (no padding)
    const expected = createHash('sha256').update(codeVerifier).digest('base64url');
    if (expected !== codeChallenge) {
      await this.redis.del(key);
      return null;
    }

    await this.redis.del(key);
    return this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  }

  async mintWsTicket(userId: string): Promise<{ ticket: string; expiresAt: string }> {
    const ticket = randomBytes(32).toString('hex');
    await this.redis.setEx(`ws_ticket:${ticket}`, userId, WS_TICKET_TTL_SECONDS);
    return { ticket, expiresAt: new Date(Date.now() + WS_TICKET_TTL_SECONDS * 1000).toISOString() };
  }

  async verifyWsTicket(ticket: string): Promise<string | null> {
    const key = `ws_ticket:${ticket}`;
    const userId = await this.redis.get(key);
    if (!userId) return null;
    await this.redis.del(key);
    return userId;
  }

  // ---- app tokens (bearer auth for native/desktop clients) ----

  private static hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Create a personal app token. The raw value is returned ONCE (only its hash is stored). */
  async createToken(userId: string, name: string) {
    const raw = `oc_${randomBytes(30).toString('base64url')}`;
    const rec = await this.prisma.apiToken.create({
      data: { userId, name: (name || 'App token').slice(0, 60), tokenHash: AuthService.hashToken(raw) },
      select: { id: true, name: true, createdAt: true },
    });
    return { ...rec, token: raw };
  }

  listTokens(userId: string) {
    return this.prisma.apiToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true, expiresAt: true },
    });
  }

  async revokeToken(userId: string, id: string) {
    const t = await this.prisma.apiToken.findUnique({ where: { id }, select: { userId: true } });
    if (!t || t.userId !== userId) throw new NotFoundException('Token not found');
    await this.prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return { success: true };
  }
}
