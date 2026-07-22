// Where the client talks to the OpenChat server. The web build defaults to
// same-origin (unchanged); native shells (desktop/mobile) have no same-origin
// server, so they set an explicit origin — via a stored value (first-run "server
// URL" field) or a build-time VITE_SERVER_URL — and authenticate with a bearer token.

const SERVER_URL_KEY = 'openchat.serverUrl';
const TOKEN_KEY = 'openchat.token';

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

// ---- bearer token (native clients; web uses the session cookie) ----
export function getToken(): string | null { return safeGet(TOKEN_KEY); }
export function setToken(token: string | null) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}
