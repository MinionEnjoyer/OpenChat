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
    if (!this.discovering) {
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

    const username =
      (claims.preferred_username as string | undefined) ??
      claims.email?.split('@')[0] ??
      `user_${claims.sub.slice(0, 8)}`;

    const user = await this.prisma.user.upsert({
      where: { authSub: claims.sub },
      update: {},
      create: {
        authSub: claims.sub,
        username,
        displayName: (claims.name as string | undefined) ?? username,
        avatarUrl: (claims.picture as string | undefined) ?? null,
      },
    });
    // NOTE: `update` is intentionally empty above — once a user has customized their
    // nickname/display name/avatar in Chat, we must NOT overwrite it from Authentik claims
    // on every subsequent login.

    delete (session as Session & { oidc?: OidcSession }).oidc;
    return { userId: user.id, idToken: tokenSet.id_token ?? '' };
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
    const { authSub, ...safe } = user;
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
    const { authSub, ...safe } = user;
    return safe;
  }

  /** Update Chat-side profile fields (username/nickname + display name + avatar + status). */
  async updateProfile(
    userId: string,
    data: { username?: string; displayName?: string; avatarUrl?: string; status?: string },
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
      },
    });
    const { authSub, ...safe } = user;
    return safe;
  }

  /** Persist the user's opaque server-rail layout (folders/order). */
  async updateServerLayout(userId: string, layout: unknown) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { serverLayout: (layout ?? null) as any },
    });
    const { authSub, ...safe } = user;
    return safe;
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
