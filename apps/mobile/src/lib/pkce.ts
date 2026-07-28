/**
 * PKCE (Proof Key for Code Exchange) flow for native mobile OIDC login
 * (FR-AUTH-001). Uses expo-auth-session's PKCE utilities for verifier/challenge
 * generation and expo-web-browser for the system-browser authorization flow.
 *
 * The actual token exchange POSTs to our custom `/auth/oauth/token` endpoint
 * (not a standard OAuth token endpoint), so we cannot use
 * `exchangeCodeAsync` from expo-auth-session directly.
 */
import * as WebBrowser from 'expo-web-browser';
import { fetchDiscoveryAsync } from 'expo-auth-session';
import { buildCodeAsync } from 'expo-auth-session/build/PKCE';
import { logger } from './logger';
import type { OidcMetadata, TokenResponse } from '../api/schema';

// ── Errors ──

export class PkceError extends Error {
  constructor(
    message: string,
    public readonly code: 'metadata_fetch_failed' | 'browser_cancelled' | 'no_code' | 'token_exchange_failed',
  ) {
    super(message);
    this.name = 'PkceError';
  }
}

// ── OIDC metadata ──

/**
 * Fetch OIDC metadata from the server's `/auth/oidc-metadata` endpoint.
 * Never hardcoded — the server is the single source of truth for issuer,
 * clientId, and redirect URI (DR-002 option D).
 */
export async function fetchOidcMetadata(baseUrl: string): Promise<OidcMetadata> {
  const url = `${baseUrl}/auth/oidc-metadata`;
  logger.debug(`fetching OIDC metadata from ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new PkceError(
      `Failed to fetch OIDC metadata: HTTP ${res.status}`,
      'metadata_fetch_failed',
    );
  }
  const body = (await res.json()) as OidcMetadata;
  if (!body.issuer || !body.clientId) {
    throw new PkceError(
      'OIDC metadata incomplete: issuer or clientId missing',
      'metadata_fetch_failed',
    );
  }
  return body;
}

// ── PKCE pair ──

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generate a PKCE verifier + S256 challenge via expo-crypto.
 * Delegates to `expo-auth-session/build/PKCE.buildCodeAsync`.
 */
export async function generatePkcePair(): Promise<PkcePair> {
  const pair = await buildCodeAsync();
  return { codeVerifier: pair.codeVerifier, codeChallenge: pair.codeChallenge };
}

// ── Authorization URL ──

/**
 * Discover the OIDC provider's authorization endpoint from its
 * `.well-known/openid-configuration`, then build the full authorization URL
 * with PKCE parameters.
 */
export async function getAuthorizationUrl(
  issuer: string,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  codeChallenge: string,
): Promise<string> {
  const discovery = await fetchDiscoveryAsync(issuer);
  const authEndpoint = discovery.authorizationEndpoint;
  if (!authEndpoint) {
    throw new PkceError(
      `No authorization_endpoint discovered at ${issuer}`,
      'metadata_fetch_failed',
    );
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${authEndpoint}?${params.toString()}`;
}

// ── Browser flow ──

export interface PkceAuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: TokenResponse['user'];
}

/**
 * Open the system browser for authorization, receive the callback on the
 * registered deep-link scheme (`openchat://auth`), extract the auth code,
 * and exchange it for tokens via `POST /auth/oauth/token`.
 */
export async function authorizeViaBrowser(
  baseUrl: string,
  metadata: OidcMetadata,
  codeVerifier: string,
  codeChallenge: string,
): Promise<PkceAuthResult> {
  const authUrl = await getAuthorizationUrl(
    metadata.issuer!,
    metadata.clientId!,
    metadata.nativeRedirectUri,
    metadata.scopes,
    codeChallenge,
  );

  logger.debug(`opening system browser for OIDC auth: ${authUrl}`);
  const result = await WebBrowser.openAuthSessionAsync(authUrl, metadata.nativeRedirectUri);

  if (result.type !== 'success') {
    throw new PkceError(
      `Browser auth flow did not complete: ${result.type}`,
      'browser_cancelled',
    );
  }

  // Extract the authorization code from the redirect URL
  const redirectUrl = result.url;
  const code = new URL(redirectUrl).searchParams.get('code');
  if (!code) {
    throw new PkceError(
      'No authorization code in redirect URL',
      'no_code',
    );
  }

  // Exchange the code for tokens via our custom endpoint
  return exchangeCode(baseUrl, code, codeVerifier, metadata.nativeRedirectUri);
}

// ── Token exchange ──

/**
 * POST the authorization code + PKCE verifier + redirect URI to
 * `POST /auth/oauth/token` (grantType=authorization_code). The server finishes
 * the OIDC exchange and returns `{ accessToken, refreshToken, expiresIn, user }`.
 */
export async function exchangeCode(
  baseUrl: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<PkceAuthResult> {
  const url = `${baseUrl}/auth/oauth/token`;
  logger.debug('exchanging authorization code for tokens');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grantType: 'authorization_code',
      code,
      codeVerifier,
      redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new PkceError(
      `Token exchange failed: HTTP ${res.status} — ${body}`,
      'token_exchange_failed',
    );
  }

  const body = (await res.json()) as TokenResponse;
  if (!body.accessToken || !body.refreshToken) {
    throw new PkceError(
      'Token exchange response missing accessToken or refreshToken',
      'token_exchange_failed',
    );
  }

  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    expiresIn: body.expiresIn,
    user: body.user,
  };
}
