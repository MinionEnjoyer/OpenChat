import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';

/**
 * P1-01 — Bearer tokens for native clients (FR-AUTH-001/002).
 *
 * Access token: JWT (HS256, JWT_SECRET), 1h, claims {sub: userId, typ:'access'}.
 * Refresh token: opaque 256-bit random, never stored raw — Redis keys use its
 * sha256. Rotation with family revocation on reuse:
 *
 *   rt:<hash>     → {userId, familyId}   unspent token (TTL 30d)
 *   rtused:<hash> → familyId             spent token, kept to detect reuse (TTL 30d)
 *   rtfam:<id>    → "1"                  family liveness; deleting it revokes every
 *                                        outstanding token in the family (TTL 30d)
 *
 * A presented token is valid only if BOTH rt:<hash> and its rtfam key exist.
 * Presenting a spent token (rtused hit) is treated as theft: the whole family
 * dies (FR-AUTH-002's "revoked/reused refresh token is rejected").
 */

const ACCESS_TTL_SECONDS = 3600;
const REFRESH_TTL_SECONDS = 30 * 24 * 3600;

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issueFamily(userId: string): Promise<IssuedTokens> {
    const familyId = randomBytes(16).toString('hex');
    await this.redis.setEx(`rtfam:${familyId}`, '1', REFRESH_TTL_SECONDS);
    return this.issueInFamily(userId, familyId);
  }

  private async issueInFamily(userId: string, familyId: string): Promise<IssuedTokens> {
    const refreshToken = randomBytes(32).toString('hex');
    await this.redis.setEx(
      `rt:${this.hash(refreshToken)}`,
      JSON.stringify({ userId, familyId }),
      REFRESH_TTL_SECONDS,
    );
    const accessToken = await this.jwt.signAsync(
      { typ: 'access' },
      { subject: userId, expiresIn: ACCESS_TTL_SECONDS },
    );
    return { accessToken, expiresIn: ACCESS_TTL_SECONDS, refreshToken };
  }

  /** Rotate: spend the presented token, issue a fresh one in the same family. */
  async refresh(refreshToken: string): Promise<IssuedTokens & { userId: string }> {
    const h = this.hash(refreshToken);
    const raw = await this.redis.get(`rt:${h}`);

    if (!raw) {
      // Not an unspent token. If it was EVER valid (spent earlier), this is
      // reuse — kill the family so the thief's copy dies with the victim's.
      const usedFamily = await this.redis.get(`rtused:${h}`);
      if (usedFamily) await this.redis.del(`rtfam:${usedFamily}`);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { userId, familyId } = JSON.parse(raw) as { userId: string; familyId: string };

    if (!(await this.redis.get(`rtfam:${familyId}`))) {
      await this.redis.del(`rt:${h}`);
      throw new UnauthorizedException('Refresh token family revoked');
    }

    // Spend before issuing: a crash between the two loses one refresh (client
    // re-logs-in) rather than leaving a token that is both spent and live.
    await this.redis.del(`rt:${h}`);
    await this.redis.setEx(`rtused:${h}`, familyId, REFRESH_TTL_SECONDS);

    const issued = await this.issueInFamily(userId, familyId);
    return { ...issued, userId };
  }

  /** Logout: revoke the presented token's whole family (FR-AUTH-004). */
  async revokeFamilyOf(refreshToken: string): Promise<void> {
    const h = this.hash(refreshToken);
    const raw = await this.redis.get(`rt:${h}`);
    let familyId: string | null = null;
    if (raw) {
      familyId = (JSON.parse(raw) as { familyId: string }).familyId;
    } else {
      familyId = await this.redis.get(`rtused:${h}`);
    }
    if (familyId) await this.redis.del(`rtfam:${familyId}`);
    await this.redis.del(`rt:${h}`);
  }

  /** Verify an access JWT; returns the userId or null (guard treats null as "try session"). */
  async verifyAccess(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string }>(token);
      return payload.typ === 'access' && typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
