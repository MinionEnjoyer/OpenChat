import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';
import { User } from '@prisma/client';

/**
 * P1-02 — Composite auth guard: valid bearer → attach user; else the existing
 * session path; else 401. Drop-in replacement for SessionGuard at every usage —
 * `@CurrentUser` and the attached user shape are unchanged, which is why the
 * cookie-based characterization suite passing untouched proves backward compat.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    let userId: string | null = null;

    const authz: string | undefined = request.headers?.authorization;
    if (authz?.startsWith('Bearer ')) {
      userId = await this.tokens.verifyAccess(authz.slice(7));
      // An invalid bearer falls through to the session path rather than
      // failing hard — a browser tab with a cookie and a stale header keeps working.
    }

    if (!userId) userId = request.session?.userId ?? null;

    if (!userId) {
      throw new UnauthorizedException('Session is invalid or expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    request.user = this.serializeUser(user);
    return true;
  }

  private serializeUser(user: User): Omit<User, 'authSub'> {
    const { authSub, ...safeUser } = user;
    return safeUser as unknown as Omit<User, 'authSub'>;
  }
}
