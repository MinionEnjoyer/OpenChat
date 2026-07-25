import {
  Controller, Get, Post, Patch, Put, Body, Req, Res, UseGuards, NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { User } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * P1-01 — Bearer token issuance (FR-AUTH-001/002).
   * Grants: authorization_code (native PKCE code posted by the app; server
   * finishes the exchange) and refresh_token (rotation; reuse kills the family).
   */
  @Post('token')
  async token(
    @Body()
    body: {
      grantType?: string;
      code?: string;
      codeVerifier?: string;
      redirectUri?: string;
      refreshToken?: string;
    },
  ) {
    if (body?.grantType === 'authorization_code') {
      if (!body.code || !body.codeVerifier || !body.redirectUri) {
        throw new BadRequestException('code, codeVerifier and redirectUri are required');
      }
      const user = await this.authService.exchangeNativeCode(
        body.code,
        body.codeVerifier,
        body.redirectUri,
      );
      const tokens = await this.tokenService.issueFamily(user.id);
      const { authSub: _authSub, ...safe } = user;
      return { ...tokens, user: safe };
    }
    if (body?.grantType === 'refresh_token') {
      if (!body.refreshToken) throw new BadRequestException('refreshToken is required');
      const { userId, ...tokens } = await this.tokenService.refresh(body.refreshToken);
      const user = await this.authService.getCurrentUser(userId);
      return { ...tokens, user };
    }
    throw new BadRequestException('grantType must be authorization_code or refresh_token');
  }

  /** P1-03 — public OIDC metadata for native clients (DR-002 option D). No auth, no secrets. */
  @Get('oidc-metadata')
  oidcMetadata() {
    return this.authService.oidcMetadata();
  }

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
    } catch (_err) {
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
  async logout(@Req() req: Request, @Res() res: Response, @Body() body?: { refreshToken?: string }) {
    // P1-02: a bearer client sends its refreshToken; revoke the whole family
    // (FR-AUTH-004) — then fall through to the session teardown, which is a
    // no-op for cookie-less requests and keeps the web path byte-identical.
    if (body?.refreshToken) {
      await this.tokenService.revokeFamilyOf(body.refreshToken);
    }
    const session = req.session as typeof req.session & { idToken?: string };
    if (!session?.idToken && body?.refreshToken) {
      req.session?.destroy(() => res.json({}));
      return;
    }
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
    // P1-02: also hand out bearer tokens — the mobile test path (still 404 in prod).
    const tokens = await this.tokenService.issueFamily(user.id);
    return { ...user, ...tokens };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: Omit<User, 'authSub'>) {
    // getCurrentUser also lazily backfills the friend code for pre-existing users.
    return this.authService.getCurrentUser(user.id);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
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
  @UseGuards(AuthGuard)
  updateServerLayout(@CurrentUser() user: Omit<User, 'authSub'>, @Body() body: { layout: unknown }) {
    return this.authService.updateServerLayout(user.id, body?.layout);
  }

  @Get('ws-ticket')
  @UseGuards(AuthGuard)
  wsTicket(@CurrentUser() user: Omit<User, 'authSub'>) {
    return this.authService.mintWsTicket(user.id);
  }
}
