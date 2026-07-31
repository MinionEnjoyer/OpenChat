// Where the client talks to the OpenChat server. The web build defaults to
// same-origin (unchanged); native shells (desktop/mobile) have no same-origin
// server, so they set an explicit origin — via a stored value (first-run "server
// URL" field) or a build-time VITE_SERVER_URL — and authenticate with a bearer token.

const SERVER_URL_KEY = 'openchat.serverUrl';
const TOKEN_KEY = 'openchat.token';
// Native clients can sign into multiple OpenChat servers; each remembered origin keeps its
// own token family here so the user can switch between them without re-authenticating.
const DOMAINS_KEY = 'openchat.domains';

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** '' = same-origin (web); otherwise 'https://host' (no trailing slash). */
export function serverOrigin(): string {
  const stored = safeGet(SERVER_URL_KEY);
  if (stored) return stored.replace(/\/$/, '');
  const env = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  return '';
}

export function setServerUrl(url: string) {
  try { localStorage.setItem(SERVER_URL_KEY, url.replace(/\/$/, '')); } catch { /* ignore */ }
}

/** REST base, e.g. '' -> '/api' (same-origin) or 'https://host/api'. */
export function apiBase(): string {
  return `${serverOrigin()}/api`;
}

/** Absolute ws(s) URL for a server-relative path like '/ws?ticket=…'. */
export function wsUrl(path: string): string {
  const origin = serverOrigin();
  const base = origin || window.location.origin;
  const u = new URL(base);
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${u.host}${path}`;
}

/**
 * Absolute URL for a server media path used directly by <img>/<video> elements. Those can't
 * send an Authorization header, so we (a) make the URL absolute (needed on native origins)
 * and (b) append the bearer token as ?token= when present (the API guard accepts it). Web
 * sessions without a token fall back to the same-origin cookie.
 */
export function mediaUrl(path: string): string {
  const origin = serverOrigin();
  const external = /^https?:\/\//i.test(path);
  const url = external ? path : `${origin}${path}`;
  const token = getToken();
  if (!token || (external && origin && !url.startsWith(origin + '/'))) return url;
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
}

// ---- bearer tokens (native clients; web uses the session cookie) ----
// Native clients authenticate with a short-lived access token + a rotating refresh
// token (OAuth Authorization-Code + PKCE, issued by POST /auth/oauth/token). The web
// build uses the session cookie and stores nothing here. TOKEN_KEY keeps its historical
// name so an existing install's stored token keeps working until the next sign-in.
const REFRESH_KEY = 'openchat.refresh';
const EXP_KEY = 'openchat.tokenExp';

/** Access token sent as `Authorization: Bearer` (and as ?token= for media). */
export function getToken(): string | null { return safeGet(TOKEN_KEY); }
export function getRefreshToken(): string | null { return safeGet(REFRESH_KEY); }
export function getTokenExpiry(): number { const v = safeGet(EXP_KEY); return v ? Number(v) : 0; }

/** Store a token family from an /auth/oauth/token response (login or refresh). */
export function setTokens(t: { accessToken: string; refreshToken?: string; expiresIn?: number }) {
  try {
    localStorage.setItem(TOKEN_KEY, t.accessToken);
    if (t.refreshToken) localStorage.setItem(REFRESH_KEY, t.refreshToken);
    if (t.expiresIn) localStorage.setItem(EXP_KEY, String(Date.now() + t.expiresIn * 1000));
  } catch { /* ignore */ }
  rememberDomain(serverOrigin()); // save/refresh this server in the switcher list
}

/** Back-compat single-token setter: sets just the access token (e.g. manual paste),
 *  or clears the whole family when passed null. Prefer setTokens()/clearTokens(). */
export function setToken(token: string | null) {
  if (token === null) { clearTokens(); return; }
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
  rememberDomain(serverOrigin());
}

export function clearTokens() {
  // Only clears the ACTIVE session; the saved-domains map is left intact so the user can
  // switch back / re-sign-in later.
  try { [TOKEN_KEY, REFRESH_KEY, EXP_KEY].forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}

// ---- multi-domain (native clients) ----
interface DomainAuth { accessToken?: string; refreshToken?: string; exp?: number }
function readDomains(): Record<string, DomainAuth> {
  try { return JSON.parse(safeGet(DOMAINS_KEY) || '{}') || {}; } catch { return {}; }
}
function writeDomains(d: Record<string, DomainAuth>) {
  try { localStorage.setItem(DOMAINS_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

/** The current active origin (same as serverOrigin), for the switcher UI. */
export function activeDomain(): string { return serverOrigin(); }

/** Servers the user has signed into (plus the current one), for the switcher UI. */
export function listDomains(): string[] {
  const active = serverOrigin();
  return Array.from(new Set([active, ...Object.keys(readDomains())].filter(Boolean)));
}

/** Snapshot the current origin's token family into the saved-domains map. */
function rememberDomain(origin: string) {
  if (!origin) return; // web (same-origin) uses the session cookie, not saved here
  const d = readDomains();
  d[origin] = {
    accessToken: safeGet(TOKEN_KEY) || undefined,
    refreshToken: safeGet(REFRESH_KEY) || undefined,
    exp: Number(safeGet(EXP_KEY)) || undefined,
  };
  writeDomains(d);
}

export function removeDomain(origin: string) {
  const d = readDomains(); delete d[origin]; writeDomains(d);
}

/** Point the client at a saved server: make it active + hydrate its stored tokens.
 *  Caller reloads the app afterward. */
export function switchDomain(origin: string) {
  rememberDomain(serverOrigin()); // preserve the current server's latest tokens first
  const auth = readDomains()[origin] || {};
  setServerUrl(origin);
  try {
    if (auth.accessToken) localStorage.setItem(TOKEN_KEY, auth.accessToken); else localStorage.removeItem(TOKEN_KEY);
    if (auth.refreshToken) localStorage.setItem(REFRESH_KEY, auth.refreshToken); else localStorage.removeItem(REFRESH_KEY);
    if (auth.exp) localStorage.setItem(EXP_KEY, String(auth.exp)); else localStorage.removeItem(EXP_KEY);
  } catch { /* ignore */ }
}

/** Begin adding a new server: drop the active session (saved domains kept) so first-run
 *  setup appears. Caller reloads. */
export function beginAddServer() {
  clearTokens();
  setServerUrl('');
}
