/**
 * Shared helpers for characterization tests. No production-code changes.
 * Seed is per-test (NO caching — DB is tmpfs, always fresh).
 */
import * as http from 'http';
import * as https from 'https';
import { WebSocket } from 'ws';

const API_BASE = process.env.CHAR_API_BASE ?? 'http://localhost:3001/api';
const WS_BASE = process.env.CHAR_WS_BASE ?? 'ws://localhost:3001/ws';
const SHARE_BASE = process.env.CHAR_SHARE_BASE ?? 'http://localhost:8800';

export interface ApiResponse<T = any> { status: number; headers: Record<string, string>; body: T; }

class CookieJar {
  private store = new Map<string, string>();
  update(raw: string | null): void {
    if (!raw) return;
    for (const part of raw.split(/;\s*/)) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const k = part.slice(0, eq).toLowerCase();
      if (['path','domain','expires','max-age','httponly','secure','samesite'].includes(k)) continue;
      this.store.set(k, part.slice(eq + 1));
    }
  }
  toString(): string { return [...this.store.entries()].map(([k,v]) => `${k}=${v}`).join('; '); }
}

export interface FetchOptions {
  method?: string; body?: any; headers?: Record<string, string>;
  jar?: CookieJar; rawResponse?: boolean;
}

export function createJar(): CookieJar { return new CookieJar(); }

export async function apiFetch<T = any>(path: string, opts: FetchOptions = {}): Promise<ApiResponse<T>> {
  const url = new URL(path.startsWith('/') ? `${API_BASE}${path}` : path);
  const method = opts.method ?? 'GET';
  const jar = opts.jar;
  const headers: Record<string, string> = { ...opts.headers };
  if (jar && jar.toString()) headers['cookie'] = jar.toString();
  if (!headers['content-type'] && method !== 'GET' && opts.body !== undefined) headers['content-type'] = 'application/json';
  let reqBody: string | undefined;
  if (opts.body !== undefined) {
    reqBody = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    headers['content-length'] = String(Buffer.byteLength(reqBody));
  }
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(url, { method, headers, rejectUnauthorized: false }, (res) => {
      if (jar) {
        const sc = res.headers['set-cookie'];
        if (sc) { if (Array.isArray(sc)) sc.forEach(c => jar.update(c)); else jar.update(sc); }
      }
      if (opts.rawResponse) { resolve({ status: res.statusCode ?? 0, headers: res.headers as any, body: res as any }); return; }
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        const rh: Record<string,string> = {};
        for (const [k,v] of Object.entries(res.headers)) if (v !== undefined) rh[k] = Array.isArray(v) ? v.join(', ') : v;
        let body: any; try { body = JSON.parse(raw); } catch { body = raw; }
        resolve({ status: res.statusCode ?? 0, headers: rh, body });
      });
    });
    req.on('error', reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

export async function shareFetch<T = any>(path: string, opts: FetchOptions = {}): Promise<ApiResponse<T>> {
  return apiFetch<T>(path.startsWith('/') ? `${SHARE_BASE}${path}` : path, opts);
}

// ── WS ──
export interface WsFrame { op: string; d: any; id?: string; }
export interface WsClient {
  ws: WebSocket; frames: WsFrame[]; closeCode: number | null; closeReason: string | null;
  waitFor(predicate: (f: WsFrame) => boolean, timeoutMs?: number): Promise<WsFrame>;
  filterFrames(predicate: (f: WsFrame) => boolean): WsFrame[];
  send(env: { op: string; d?: any; id?: string }): void;
  close(code?: number, reason?: string): void;
}

export async function wsConnect(jar: CookieJar): Promise<WsClient> {
  const tr = await apiFetch('/auth/ws-ticket', { jar });
  const url = `${WS_BASE}?ticket=${encodeURIComponent(tr.body.ticket)}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const frames: WsFrame[] = [];
    let cc: number | null = null, cr: string | null = null;
    const pending: Array<{ resolve: (f: WsFrame) => void; predicate: (f: WsFrame) => boolean }> = [];
    const proc = (raw: string) => { let env: WsFrame; try { env = JSON.parse(raw); } catch { return; } frames.push(env); for (let i = pending.length-1; i>=0; i--) { if (pending[i].predicate(env)) { const r = pending[i]!; pending.splice(i,1); r.resolve(env); } } };
    ws.on('message', d => proc(d.toString()));
    ws.on('close', (code, reason) => { cc = code; cr = reason?.toString() ?? null; });
    ws.on('error', () => {});
    let resolved = false;
    ws.on('open', () => {
      const t = setTimeout(() => { if (!resolved) { resolved = true; resolve(build(ws,frames,cc,cr,pending)); } }, 10_000);
      const check = () => { if (frames.find(f=>f.op==='ready')) { clearTimeout(t); resolved = true; resolve(build(ws,frames,cc,cr,pending)); } else setTimeout(check, 100); };
      check();
    });
    function build(ws: WebSocket, frames: WsFrame[], cc: number|null, cr: string|null, pending: Array<any>): WsClient {
      return {
        ws, frames, get closeCode() { return cc; }, get closeReason() { return cr; },
        waitFor(pred, ms=10_000) { const e = frames.find(pred); if (e) return Promise.resolve(e); return new Promise((res,rej) => { const t = setTimeout(() => { const i = pending.findIndex(r=>r.resolve===res); if (i>=0) pending.splice(i,1); rej(new Error('waitFor timeout')); }, ms); pending.push({ resolve: (f:any) => { clearTimeout(t); res(f); }, predicate: pred }); }); },
        filterFrames(pred) { return frames.filter(pred); },
        send(env) { ws.send(JSON.stringify(env)); },
        close(code, reason) { ws.close(code, reason); },
      };
    }
  });
}

// ── Dev-login ──
interface DevUser { username: string; userId: string; jar: CookieJar; }
export async function devLogin(username: string): Promise<DevUser> {
  const jar = createJar();
  const res = await apiFetch('/auth/dev-login', { method: 'POST', body: { username }, jar });
  // characterizes: dev-login returns 201 Created
  if (res.status !== 201 && res.status !== 200) throw new Error(`dev-login failed: ${res.status}`);
  return { username, userId: res.body.id, jar };
}

// ── Seed (ALWAYS FRESH — no module-level caching) ──
export interface SeedContext {
  alice: DevUser; bob: DevUser; carol: DevUser;
  serverId: string; textChannelId: string; voiceChannelId: string;
  adminRoleId: string; modRoleId: string; memberRoleId: string;
  messageIds: string[];
}

export async function seed(): Promise<SeedContext> {
  const alice = await devLogin('alice');
  const bob = await devLogin('bob');
  const carol = await devLogin('carol');
  const srv = await apiFetch('/servers', { method: 'POST', body: { name: 'Char Test Guild' }, jar: alice.jar });
  const serverId = srv.body.id;
  const ch1 = await apiFetch(`/servers/${serverId}/channels`, { method: 'POST', body: { name: 'general', type: 'TEXT' }, jar: alice.jar });
  const textChannelId = ch1.body.id;
  const ch2 = await apiFetch(`/servers/${serverId}/channels`, { method: 'POST', body: { name: 'voice', type: 'VOICE' }, jar: alice.jar });
  const voiceChannelId = ch2.body.id;
  await apiFetch(`/servers/${serverId}/members`, { method: 'POST', body: { userId: bob.userId }, jar: alice.jar });
  await apiFetch(`/servers/${serverId}/members`, { method: 'POST', body: { userId: carol.userId }, jar: alice.jar });
  const roles = await apiFetch(`/servers/${serverId}/roles`, { jar: alice.jar });
  const memberRoleId = roles.body.find((r: any) => r.name === '@everyone')?.id ?? roles.body[0]?.id ?? '';
  const adminRole = await apiFetch(`/servers/${serverId}/roles`, { method: 'POST', body: { name: 'Admin', color: 16711680, permissions: '255' }, jar: alice.jar });
  const modRole = await apiFetch(`/servers/${serverId}/roles`, { method: 'POST', body: { name: 'Mod', color: 65280, permissions: '32' }, jar: alice.jar });
  const messageIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const msg = await apiFetch(`/channels/${textChannelId}/messages`, { method: 'POST', body: { content: `Seed message ${i + 1}` }, jar: alice.jar });
    messageIds.push(msg.body.id);
  }
  return { alice, bob, carol, serverId, textChannelId, voiceChannelId, adminRoleId: adminRole.body.id, modRoleId: modRole.body.id, memberRoleId, messageIds };
}

// ── Assertions ──
export function assertIsoDate(val: any): string { expect(typeof val).toBe('string'); expect(()=>new Date(val)).not.toThrow(); expect(val).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); return val; }
export function assertUuid(val: any): string { expect(typeof val).toBe('string'); expect(val).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i); return val; }
export function assertBigIntString(val: any): string { expect(typeof val).toBe('string'); expect(val).toMatch(/^\d+$/); return val; }

export function assertUserShape(user: any): void {
  expect(user).toHaveProperty('id'); assertUuid(user.id);
  expect(user).toHaveProperty('username'); expect(typeof user.username).toBe('string');
  expect(user).toHaveProperty('displayName');
  expect(user).toHaveProperty('avatarUrl');
  expect(user).toHaveProperty('friendCode');
  expect(user).toHaveProperty('status');
  expect(user).toHaveProperty('serverLayout');
  expect(user).toHaveProperty('createdAt'); assertIsoDate(user.createdAt);
  expect(user).toHaveProperty('updatedAt'); assertIsoDate(user.updatedAt);
  expect(user).not.toHaveProperty('authSub');
}

export function assertServerShape(s: any): void {
  expect(s).toHaveProperty('id'); assertUuid(s.id);
  expect(s).toHaveProperty('name');
  expect(s).toHaveProperty('ownerId'); assertUuid(s.ownerId);
  expect(s).toHaveProperty('iconUrl');
  expect(s).toHaveProperty('createdAt'); assertIsoDate(s.createdAt);
  expect(s).toHaveProperty('updatedAt'); assertIsoDate(s.updatedAt);
}

export function assertChannelShape(ch: any): void {
  expect(ch).toHaveProperty('id'); assertUuid(ch.id);
  expect(ch).toHaveProperty('name');
  expect(ch).toHaveProperty('type');
  expect(['TEXT','VOICE','ANNOUNCEMENT','DM','GROUP_DM']).toContain(ch.type);
  expect(ch).toHaveProperty('serverId');
  expect(ch).toHaveProperty('categoryId');
  expect(ch).toHaveProperty('topic');
  expect(ch).toHaveProperty('position');
  expect(ch).toHaveProperty('parentId');
}

export function assertMessageShape(msg: any): void {
  expect(msg).toHaveProperty('id'); assertUuid(msg.id);
  expect(msg).toHaveProperty('channelId'); assertUuid(msg.channelId);
  expect(msg).toHaveProperty('authorId'); assertUuid(msg.authorId);
  expect(msg).toHaveProperty('content');
  expect(msg).toHaveProperty('createdAt'); assertIsoDate(msg.createdAt);
  expect(msg).toHaveProperty('editedAt');
  expect(msg).toHaveProperty('deletedAt');
  expect(msg).toHaveProperty('replyToId');
  expect(msg).toHaveProperty('pinned');
  expect(msg).toHaveProperty('author'); expect(msg.author).toHaveProperty('id');
  expect(msg).toHaveProperty('attachments'); expect(Array.isArray(msg.attachments)).toBe(true);
  expect(msg).toHaveProperty('reactions'); expect(Array.isArray(msg.reactions)).toBe(true);
  expect(msg).toHaveProperty('replyTo');
  expect(msg).toHaveProperty('poll');
}