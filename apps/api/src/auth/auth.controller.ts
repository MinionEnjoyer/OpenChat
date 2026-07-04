import {
  Controller, Get, Post, Patch, Put, Body, Req, Res, UseGuards, NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';
import type { User } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('login')
  async login(@Req() req: Request, @Res() res: Response) {
    const url = await this.authService.beginLogin(req.session);
    res.redirect(url);
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const session = req.session as typeof req.session & {
      userId?: string;
      idToken?: string;
      loginRetries?: number;
    };
    try {
      const { userId, idToken } = await this.authService.completeLogin(
        req.session,
        req.query as Record<string, string>,
      );
      session.userId = userId;
      session.idToken = idToken;
      session.loginRetries = 0;
      // Persist the logged-in session BEFORE redirecting so the app's first /auth/me finds it.
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );
      res.redirect('/');
    } catch (err) {
      // A stale/overlapping login (e.g. OIDC state mismatch from multiple open flows) should
      // restart the login cleanly rather than 500 — Authentik's SSO session makes it instant.
      session.loginRetries = (session.loginRetries ?? 0) + 1;
      const tooMany = session.loginRetries > 2;
      if (tooMany) session.loginRetries = 0;
      await new Promise<void>((resolve) => req.session.save(() => resolve()));
      if (tooMany) {
        res
          .status(400)
          .send('Sign-in could not be completed. Please close other login tabs, clear this site’s cookies, and try again.');
      } else {
        res.redirect('/api/auth/login');
      }
    }
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const session = req.session as typeof req.session & { idToken?: string };
    let endSessionUrl = '/';
    try {
      endSessionUrl = await this.authService.endSessionUrl(session.idToken ?? '');
    } catch {
      /* IdP unreachable — still destroy the local session */
    }
    req.session.destroy(() => res.json({ endSessionUrl }));
  }

  // DEV ONLY: log in as a test user without Authentik. Gated by env; 404 in prod.
  @Post('dev-login')
  async devLogin(@Req() req: Request, @Body('username') username: string) {
    if (process.env.NODE_ENV === 'production' || process.env.DEV_AUTH !== '1') {
      throw new NotFoundException();
    }
    const user = await this.authService.devLogin(username || 'dev');
    (req.session as typeof req.session & { userId?: string }).userId = user.id;
    return user;
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: Omit<User, 'authSub'>) {
    // getCurrentUser also lazily backfills the friend code for pre-existing users.
    return this.authService.getCurrentUser(user.id);
  }

  @Patch('me')
  @UseGuards(SessionGuard)
  updateMe(
    @CurrentUser() user: Omit<User, 'authSub'>,
    @Body() body: { username?: string; displayName?: string; avatarUrl?: string; status?: string },
  ) {
    return this.authService.updateProfile(user.id, {
      username: typeof body.username === 'string' ? body.username.slice(0, 32) : undefined,
      displayName: typeof body.displayName === 'string' ? body.displayName.slice(0, 80) : undefined,
      avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl.slice(0, 1000) : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
    });
  }

  @Put('server-layout')
  @UseGuards(SessionGuard)
  updateServerLayout(@CurrentUser() user: Omit<User, 'authSub'>, @Body() body: { layout: unknown }) {
    return this.authService.updateServerLayout(user.id, body?.layout);
  }

  @Get('ws-ticket')
  @UseGuards(SessionGuard)
  wsTicket(@CurrentUser() user: Omit<User, 'authSub'>) {
    return this.authService.mintWsTicket(user.id);
  }
}
