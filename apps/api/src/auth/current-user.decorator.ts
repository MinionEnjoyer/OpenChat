import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@prisma/client';

/** Resolves the user attached to the request by SessionGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Omit<User, 'authSub'> => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
