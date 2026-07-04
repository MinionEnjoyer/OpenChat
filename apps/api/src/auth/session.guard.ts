import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';

// Note: CurrentUser decorator belongs in apps/api/src/auth/current-user.decorator.ts
// export const CurrentUser = createParamDecorator((data, ctx) => { ... });

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    if (!request.session?.userId) {
      throw new UnauthorizedException('Session is invalid or expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: request.session.userId },
    });

    if (!user) {
      // Session exists in Redis but user was deleted; clear session and reject
      throw new UnauthorizedException('User not found');
    }

    // Attach user to request object for downstream controllers/guards
    request.user = this.serializeUser(user);

    return true;
  }

  private serializeUser(user: User): Omit<User, 'authSub'> {
    const { authSub, ...safeUser } = user;
    return safeUser as unknown as Omit<User, 'authSub'>;
  }
}
