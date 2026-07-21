import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';

/**
 * Authenticates a request via either a bearer app token (Authorization: Bearer …,
 * used by native/desktop clients) or the browser session cookie (web app).
 * Depends only on the global PrismaService so it works in every module.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const header: string | undefined = request.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      const tokenHash = createHash('sha256').update(header.slice(7).trim()).digest('hex');
      const token = await this.prisma.apiToken.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!token || token.revokedAt || (token.expiresAt && token.expiresAt.getTime() < Date.now())) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      // Throttle lastUsedAt writes to at most once per minute.
      if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 60_000) {
        this.prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      }
      request.user = this.serializeUser(token.user);
      return true;
    }

    if (!request.session?.userId) {
      throw new UnauthorizedException('Session is invalid or expired');
    }
    const user = await this.prisma.user.findUnique({ where: { id: request.session.userId } });
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
