/**
 * @satisfies P1-01 desktop PKCE opt-in (RFC 7636)
 *
 * Unit tests for AuthController desktopLogin + token exchange with PKCE.
 * Mocks AuthService + TokenService; the controller is exercised directly.
 */
import { Test, type TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { AuthGuard } from './auth.guard';
import { SessionGuard } from './session.guard';

describe('AuthController — desktop PKCE', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Partial<AuthService>>;
  let tokenService: jest.Mocked<Partial<TokenService>>;

  const USER_ID = 'user-123';

  beforeEach(async () => {
    authService = {
      createToken: jest.fn(),
      generateDesktopPkceCode: jest.fn(),
      exchangeDesktopPkceCode: jest.fn(),
      exchangeNativeCode: jest.fn(),
      getCurrentUser: jest.fn(),
    };

    tokenService = {
      issueFamily: jest.fn(),
      refresh: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: TokenService, useValue: tokenService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuthController);
  });

  // ── desktopLogin ───────────────────────────────────────────

  describe('GET /auth/desktop', () => {
    it('no PKCE params → mints a token via createToken (backward compat)', async () => {
      authService.createToken!.mockResolvedValue({ token: 'oc_faketoken123', id: 't1', name: 'Desktop app', createdAt: new Date() });

      const req = { session: { userId: USER_ID } } as any;
      const res = {
        type: jest.fn().mockReturnThis(),
        send: jest.fn(),
        redirect: jest.fn(),
      } as any;

      await controller.desktopLogin(req, res, undefined, undefined);

      // Should NOT call PKCE code generation
      expect(authService.generateDesktopPkceCode).not.toHaveBeenCalled();
      // Should call createToken (the backward-compat path)
      expect(authService.createToken).toHaveBeenCalledWith(USER_ID, 'Desktop app');
      // Response HTML should contain a token deep-link
      const html = res.send.mock.calls[0][0] as string;
      expect(html).toContain('openchat://auth?token=');
      expect(html).not.toContain('openchat://auth?code=');
    });

    it('PKCE params → mints a code (NO bearer token)', async () => {
      authService.generateDesktopPkceCode!.mockResolvedValue('deadbeef1234abcd');

      const req = { session: { userId: USER_ID } } as any;
      const res = {
        type: jest.fn().mockReturnThis(),
        send: jest.fn(),
        redirect: jest.fn(),
      } as any;

      await controller.desktopLogin(req, res, 'challenge123', 'S256');

      // Should call PKCE code generation
      expect(authService.generateDesktopPkceCode).toHaveBeenCalledWith(USER_ID, 'challenge123');
      // Should NOT call createToken
      expect(authService.createToken).not.toHaveBeenCalled();
      // Response HTML should contain a code deep-link (NOT a token)
      const html = res.send.mock.calls[0][0] as string;
      expect(html).toContain('openchat://auth?code=');
      expect(html).not.toContain('openchat://auth?token=');
      expect(html).toContain('deadbeef1234abcd');
    });

    it('unauthenticated → redirects to login', async () => {
      const req = { session: {} } as any;
      const res = {
        type: jest.fn().mockReturnThis(),
        send: jest.fn(),
        redirect: jest.fn(),
      } as any;

      await controller.desktopLogin(req, res, undefined, undefined);

      expect(res.redirect).toHaveBeenCalledWith('/api/auth/login?returnTo=/api/auth/desktop');
      expect(authService.createToken).not.toHaveBeenCalled();
    });

    it('unauthenticated with PKCE params → preserves them in redirect', async () => {
      const req = { session: {} } as any;
      const res = {
        type: jest.fn().mockReturnThis(),
        send: jest.fn(),
        redirect: jest.fn(),
      } as any;

      await controller.desktopLogin(req, res, 'challenge123', 'S256');

      const redirectUrl = res.redirect.mock.calls[0][0] as string;
      expect(redirectUrl).toContain('code_challenge=challenge123');
      expect(redirectUrl).toContain('code_challenge_method=S256');
    });
  });

  // ── POST /auth/oauth/token (desktop PKCE exchange) ───────────────

  describe('POST /auth/oauth/token — desktop PKCE exchange', () => {
    it('desktop PKCE code → calls exchangeDesktopPkceCode then issueFamily', async () => {
      authService.exchangeDesktopPkceCode!.mockResolvedValue({ id: USER_ID });
      authService.getCurrentUser!.mockResolvedValue({ id: USER_ID, username: 'test' } as any);
      tokenService.issueFamily!.mockResolvedValue({
        accessToken: 'at123',
        refreshToken: 'rt123',
        expiresIn: 3600,
      });

      const result = await controller.token({
        grantType: 'authorization_code',
        code: 'desktop-code-123',
        codeVerifier: 'verifier-123',
        redirectUri: 'openchat://auth',
      });

      // Should try desktop PKCE first
      expect(authService.exchangeDesktopPkceCode).toHaveBeenCalledWith('desktop-code-123', 'verifier-123');
      // Should NOT call exchangeNativeCode (desktop PKCE handled it)
      expect(authService.exchangeNativeCode).not.toHaveBeenCalled();
      // Should issue tokens
      expect(tokenService.issueFamily).toHaveBeenCalledWith(USER_ID);
      // Should return tokens
      expect(result).toHaveProperty('accessToken', 'at123');
      expect(result).toHaveProperty('refreshToken', 'rt123');
    });

    it('non-desktop code → falls through to exchangeNativeCode', async () => {
      // exchangeDesktopPkceCode returns null (not a desktop code)
      authService.exchangeDesktopPkceCode!.mockResolvedValue(null);
      authService.exchangeNativeCode!.mockResolvedValue({ id: USER_ID, authSub: 'sub1', username: 'test' } as any);
      tokenService.issueFamily!.mockResolvedValue({
        accessToken: 'at456',
        refreshToken: 'rt456',
        expiresIn: 3600,
      });

      const result = await controller.token({
        grantType: 'authorization_code',
        code: 'oidc-code-456',
        codeVerifier: 'verifier-456',
        redirectUri: 'openchat://auth',
      });

      // Should try desktop PKCE first
      expect(authService.exchangeDesktopPkceCode).toHaveBeenCalledWith('oidc-code-456', 'verifier-456');
      // Should fall through to OIDC exchange
      expect(authService.exchangeNativeCode).toHaveBeenCalledWith('oidc-code-456', 'verifier-456', 'openchat://auth');
      // Should issue tokens
      expect(tokenService.issueFamily).toHaveBeenCalledWith(USER_ID);
      expect(result).toHaveProperty('accessToken', 'at456');
      expect(result).toHaveProperty('refreshToken', 'rt456');
    });

    it('refresh_token grant is unchanged', async () => {
      tokenService.refresh!.mockResolvedValue({
        accessToken: 'at789',
        refreshToken: 'rt789',
        expiresIn: 3600,
        userId: USER_ID,
      });
      authService.getCurrentUser!.mockResolvedValue({ id: USER_ID, username: 'test' } as any);

      const result = await controller.token({
        grantType: 'refresh_token',
        refreshToken: 'old-rt',
      });

      expect(tokenService.refresh).toHaveBeenCalledWith('old-rt');
      expect(result).toHaveProperty('accessToken', 'at789');
    });
  });
});
