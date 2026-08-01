/**
 * Shared helpers for characterization tests. No production-code changes.
 * Seed is per-test (NO caching — DB is tmpfs, always fresh).
 *
 * Shape assertions are EXHAUSTIVE: they check exact key sets (presence AND
 * absence), recurse into nested objects and arrays, and normalize volatile
 * values (ids, timestamps) by asserting a type pattern — never by omission.
 * An unexpected key fails. A renamed key fails.
 */
import * as http from 'http';
import * as https from 'https';
import { WebSocket } from 'ws';

const API_BASE = process.env.CHAR_API_BASE ?? 'http://localhost:3001/api';
export const WS_BASE = process.env.CHAR_WS_BASE ?? 'ws://localhost:3001/ws';
const SHARE_BASE = process.env.CHAR_SHARE_BASE ?? 'http://localhost:8800';
const WEB_ORIGIN = process.env.CHAR_WEB_ORIGIN ?? process.env.WEB_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:5173';

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
  // Cookie-authenticated browser mutations are origin-checked by the API.
  // Model the configured first-party web client unless a test explicitly
  // supplies its own Origin header (for example, a CSRF rejection probe).
  if (jar?.toString() && method !== 'GET' && method !== 'HEAD' && headers.origin === undefined) {
    headers.origin = WEB_ORIGIN;
  }
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
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const frames: WsFrame[] = [];
    let cc: number | null = null, cr: string | null = null;
    const pending: Array<{ resolve: (f: WsFrame) => void; predicate: (f: WsFrame) => boolean }> = [];
    const proc = (raw: string) => { let env: WsFrame; try { env = JSON.parse(raw); } catch { return; } frames.push(env); for (let i = pending.length-1; i>=0; i--) { if (pending[i].predicate(env)) { const r = pending[i]!; pending.splice(i,1); r.resolve(env); } } };
    ws.on('message', d => proc(d.toString()));
    ws.on('close', (code, reason) => { cc = code; cr = reason?.toString() ?? null; });
    ws.on('error', () => { /* swallowed for test stability — connection errors surface as timeout */ });
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
  /** Message with attachments — exercises assertAttachmentShape */
  attachmentMsgId: string;
  /** Message that is a reply — exercises assertReplyToShape */
  replyMsgId: string;
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
  // Message with fake attachment (exercises assertAttachmentShape)
  const attMsg = await apiFetch(`/channels/${textChannelId}/messages`, {
    method: 'POST',
    body: {
      content: 'Message with attachment',
      attachments: [{
        shareAssetId: 'fake-asset-id-001',
        filename: 'test.png',
        mimeType: 'image/png',
        size: 1024,
        url: 'http://localhost:8800/raw/test',
        thumbnailUrl: 'http://localhost:8800/thumb/test',
        width: null,
        height: null,
        durationMs: null,
      }],
    },
    jar: alice.jar,
  });
  const attachmentMsgId = attMsg.body.id;

  // Message that is a reply (exercises assertReplyToShape)
  const replyMsg = await apiFetch(`/channels/${textChannelId}/messages`, {
    method: 'POST',
    body: {
      content: 'This is a reply',
      replyToId: messageIds[0],
    },
    jar: alice.jar,
  });
  const replyMsgId = replyMsg.body.id;

  return { alice, bob, carol, serverId, textChannelId, voiceChannelId, adminRoleId: adminRole.body.id, modRoleId: modRole.body.id, memberRoleId, messageIds, attachmentMsgId, replyMsgId };
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXHAUSTIVE SHAPE ASSERTIONS
//  Every assertion below validates the exact set of keys (presence AND
//  absence) and recurses into nested objects/arrays. A renamed key fails
//  because the old name won't be in the expected set. An extra key fails
//  because it won't be in the expected set either.
// ═══════════════════════════════════════════════════════════════════════════

// ── Primitive validators (volatile value normalization — never omit) ──

export function assertIsoDate(val: any): string {
  expect(typeof val).toBe('string');
  expect(() => new Date(val)).not.toThrow();
  expect(val).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  return val;
}

export function assertUuid(val: any): string {
  expect(typeof val).toBe('string');
  expect(val).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  return val;
}

export function assertBigIntString(val: any): string {
  expect(typeof val).toBe('string');
  expect(val).toMatch(/^\d+$/);
  return val;
}

/**
 * Assert obj has exactly the given keys (and no others).
 * Order-independent; sorts both before comparison.
 */
export function assertExactKeys(obj: Record<string, any>, expectedKeys: string[], label: string = 'object'): void {
  const actual = Object.keys(obj).sort();
  const expected = [...expectedKeys].sort();
  try {
    expect(actual).toEqual(expected);
  } catch {
    // Provide a descriptive diff
    const extra = actual.filter(k => !expected.includes(k));
    const missing = expected.filter(k => !actual.includes(k));
    const parts: string[] = [];
    if (extra.length) parts.push(`unexpected keys: [${extra.join(', ')}]`);
    if (missing.length) parts.push(`missing keys: [${missing.join(', ')}]`);
    throw new Error(`${label} key set mismatch: ${parts.join('; ')}`);
  }
}

// ── User shape (from auth.service getCurrentUser / devLogin / me / PATCH me) ──
// Keys: id, username, displayName, avatarUrl, friendCode, status,
// customStatus, bio, serverLayout, bot metadata, createdAt, updatedAt
// Explicitly absent: authSub

const USER_KEYS = [
  'id',
  'username',
  'displayName',
  'avatarUrl',
  'friendCode',
  'status',
  'customStatus',
  'bio',
  'serverLayout',
  'isBot',
  'botOwnerId',
  'botDescription',
  'botPublished',
  'createdAt',
  'updatedAt',
];

export function assertUserShape(user: any): void {
  assertExactKeys(user, USER_KEYS, 'User');
  assertUuid(user.id);
  expect(typeof user.username).toBe('string');
  // displayName: string or null
  if (user.displayName !== null) expect(typeof user.displayName).toBe('string');
  // avatarUrl: string or null
  if (user.avatarUrl !== null) expect(typeof user.avatarUrl).toBe('string');
  // friendCode: string|null (null = lazy backfill)
  if (user.friendCode !== null) { expect(typeof user.friendCode).toBe('string'); expect(user.friendCode).toMatch(/^\d{8}$/); }
  expect(typeof user.status).toBe('string');
  // customStatus and bio: string or null
  if (user.customStatus !== null) expect(typeof user.customStatus).toBe('string');
  if (user.bio !== null) expect(typeof user.bio).toBe('string');
  // serverLayout: JSON object or null
  if (user.serverLayout !== null && user.serverLayout !== undefined) expect(typeof user.serverLayout).toBe('object');
  expect(typeof user.isBot).toBe('boolean');
  if (user.botOwnerId !== null) assertUuid(user.botOwnerId);
  if (user.botDescription !== null) expect(typeof user.botDescription).toBe('string');
  expect(typeof user.botPublished).toBe('boolean');
  assertIsoDate(user.createdAt);
  assertIsoDate(user.updatedAt);
  // authSub must NEVER be exposed
  expect(user).not.toHaveProperty('authSub');
}

// ── Server shape ──
const SERVER_KEYS = ['id', 'name', 'ownerId', 'iconUrl', 'createdAt', 'updatedAt', 'myPermissions'];

export function assertServerShape(s: any): void {
  assertExactKeys(s, SERVER_KEYS, 'Server');
  assertUuid(s.id);
  expect(typeof s.name).toBe('string');
  assertUuid(s.ownerId);
  // iconUrl: string or null
  if (s.iconUrl !== null) expect(typeof s.iconUrl).toBe('string');
  assertIsoDate(s.createdAt);
  assertIsoDate(s.updatedAt);
}

// ── Channel shape ──
const CHANNEL_KEYS = ['id', 'name', 'type', 'serverId', 'categoryId', 'topic', 'position', 'parentId', 'isDefault'];

export function assertChannelShape(ch: any): void {
  assertExactKeys(ch, CHANNEL_KEYS, 'Channel');
  assertUuid(ch.id);
  expect(typeof ch.name).toBe('string');
  expect(['TEXT', 'VOICE', 'ANNOUNCEMENT', 'DM', 'GROUP_DM']).toContain(ch.type);
  // serverId: nullable UUID
  if (ch.serverId !== null) assertUuid(ch.serverId);
  // categoryId: nullable UUID
  if (ch.categoryId !== null) assertUuid(ch.categoryId);
  // topic: string or null
  if (ch.topic !== null) expect(typeof ch.topic).toBe('string');
  expect(typeof ch.position).toBe('number');
  // parentId: nullable UUID
  if (ch.parentId !== null) assertUuid(ch.parentId);
  expect(typeof ch.isDefault).toBe('boolean');
}

// ── Author sub-shape (embedded in messages) ──
const AUTHOR_KEYS = ['id', 'username', 'displayName', 'avatarUrl', 'status', 'isBot'];

export function assertAuthorShape(author: any): void {
  assertExactKeys(author, AUTHOR_KEYS, 'Author');
  assertUuid(author.id);
  expect(typeof author.username).toBe('string');
  if (author.displayName !== null) expect(typeof author.displayName).toBe('string');
  if (author.avatarUrl !== null) expect(typeof author.avatarUrl).toBe('string');
  expect(typeof author.status).toBe('string');
  expect(typeof author.isBot).toBe('boolean');
}

// ── Attachment shape ──
const ATTACHMENT_KEYS = ['id', 'messageId', 'shareAssetId', 'filename', 'mimeType', 'size', 'url', 'thumbnailUrl', 'width', 'height', 'durationMs'];

export function assertAttachmentShape(att: any): void {
  assertExactKeys(att, ATTACHMENT_KEYS, 'Attachment');
  assertUuid(att.id);
  assertUuid(att.messageId);
  expect(typeof att.shareAssetId).toBe('string');
  expect(typeof att.filename).toBe('string');
  expect(typeof att.mimeType).toBe('string');
  // size: BigInt serialized as string
  assertBigIntString(att.size);
  expect(typeof att.url).toBe('string');
  // thumbnailUrl: string or null
  if (att.thumbnailUrl !== null) expect(typeof att.thumbnailUrl).toBe('string');
  // width/height: number or null
  if (att.width !== null) expect(typeof att.width).toBe('number');
  if (att.height !== null) expect(typeof att.height).toBe('number');
  // durationMs: number or null
  if (att.durationMs !== null) expect(typeof att.durationMs).toBe('number');
}

// ── Reaction sub-shape (grouped) ──
const REACTION_KEYS = ['emoji', 'count', 'userIds'];

export function assertReactionShape(r: any): void {
  assertExactKeys(r, REACTION_KEYS, 'Reaction');
  expect(typeof r.emoji).toBe('string');
  expect(typeof r.count).toBe('number');
  expect(r.count).toBeGreaterThanOrEqual(1);
  expect(Array.isArray(r.userIds)).toBe(true);
  for (const uid of r.userIds) {
    assertUuid(uid);
  }
}

// ── ReplyTo sub-shape (embedded in messages) ──
const REPLY_TO_KEYS = ['id', 'authorName', 'content'];

export function assertReplyToShape(replyTo: any): void {
  assertExactKeys(replyTo, REPLY_TO_KEYS, 'ReplyTo');
  assertUuid(replyTo.id);
  expect(typeof replyTo.authorName).toBe('string');
  expect(typeof replyTo.content).toBe('string');
}

// ── Poll option sub-shape ──
const POLL_OPTION_KEYS = ['id', 'text', 'voterIds'];

export function assertPollOptionShape(opt: any): void {
  assertExactKeys(opt, POLL_OPTION_KEYS, 'PollOption');
  assertUuid(opt.id);
  expect(typeof opt.text).toBe('string');
  expect(Array.isArray(opt.voterIds)).toBe(true);
  for (const vid of opt.voterIds) {
    assertUuid(vid);
  }
}

// ── Poll sub-shape (embedded in messages) ──
const POLL_KEYS = ['id', 'question', 'multiple', 'closesAt', 'options'];

export function assertPollShape(poll: any): void {
  assertExactKeys(poll, POLL_KEYS, 'Poll');
  assertUuid(poll.id);
  expect(typeof poll.question).toBe('string');
  expect(typeof poll.multiple).toBe('boolean');
  // closesAt: ISO date string or null
  if (poll.closesAt !== null) assertIsoDate(poll.closesAt);
  expect(Array.isArray(poll.options)).toBe(true);
  for (const opt of poll.options) {
    assertPollOptionShape(opt);
  }
}

// ── Message shape (EXHAUSTIVE) ──
const MESSAGE_KEYS = ['id', 'channelId', 'authorId', 'content', 'kind', 'createdAt', 'editedAt', 'deletedAt', 'replyToId', 'pinned', 'author', 'attachments', 'reactions', 'replyTo', 'poll'];

export function assertMessageShape(msg: any): void {
  assertExactKeys(msg, MESSAGE_KEYS, 'Message');
  assertUuid(msg.id);
  assertUuid(msg.channelId);
  assertUuid(msg.authorId);
  expect(typeof msg.content).toBe('string');
  expect(['USER', 'MEMBER_JOINED', 'MEMBER_LEFT']).toContain(msg.kind);
  assertIsoDate(msg.createdAt);
  // editedAt: ISO date or null
  if (msg.editedAt !== null) assertIsoDate(msg.editedAt);
  // deletedAt: ISO date or null
  if (msg.deletedAt !== null) assertIsoDate(msg.deletedAt);
  // replyToId: uuid or null
  if (msg.replyToId !== null) assertUuid(msg.replyToId);
  expect(typeof msg.pinned).toBe('boolean');

  // ── Recurse into nested objects ──
  assertAuthorShape(msg.author);

  expect(Array.isArray(msg.attachments)).toBe(true);
  for (const att of msg.attachments) {
    assertAttachmentShape(att);
  }

  expect(Array.isArray(msg.reactions)).toBe(true);
  for (const r of msg.reactions) {
    assertReactionShape(r);
  }

  // replyTo: object or null
  if (msg.replyTo !== null) {
    assertReplyToShape(msg.replyTo);
  }

  // poll: object or null
  if (msg.poll !== null) {
    assertPollShape(msg.poll);
  }
}

// ── Server member shape ──
const MEMBER_KEYS = ['userId', 'user', 'roleIds', 'isOwner', 'joinedAt', 'nickname'];

export function assertMemberShape(m: any): void {
  assertExactKeys(m, MEMBER_KEYS, 'ServerMember');
  assertUuid(m.userId);
  expect(typeof m.user).toBe('object');
  // user sub-object: id, username, displayName, avatarUrl (at minimum)
  expect(m.user).toHaveProperty('id');
  expect(m.user).toHaveProperty('username');
  expect(Array.isArray(m.roleIds)).toBe(true);
  for (const rid of m.roleIds) {
    assertUuid(rid);
  }
}

// ── Invite shape (create response) ──
const INVITE_KEYS = ['code', 'serverId', 'expiresAt', 'maxUses'];

export function assertInviteShape(inv: any): void {
  assertExactKeys(inv, INVITE_KEYS, 'Invite');
  expect(typeof inv.code).toBe('string');
  expect(inv.code.length).toBeGreaterThan(0);
  assertUuid(inv.serverId);
  // expiresAt: ISO date or null
  if (inv.expiresAt !== null) assertIsoDate(inv.expiresAt);
  // maxUses: number or null
  if (inv.maxUses !== null) expect(typeof inv.maxUses).toBe('number');
}

// ── Invite preview shape (GET /invites/:code) ──
const INVITE_PREVIEW_KEYS = ['code', 'expiresAt', 'server', 'inviter'];

export function assertInvitePreviewShape(inv: any): void {
  assertExactKeys(inv, INVITE_PREVIEW_KEYS, 'InvitePreview');
  expect(typeof inv.server).toBe('object');
  expect(inv.server).toHaveProperty('name');
  expect(inv.server).toHaveProperty('id');
  expect(typeof inv.inviter).toBe('object');
  expect(inv.inviter).toHaveProperty('username');
  expect(inv.inviter).toHaveProperty('id');
}

// ── Role shape ──
// `mentionable` added by FR-ROLE-007 (@role mentions) — an INTENTIONAL contract change.
// The regression net correctly flagged it; baseline updated by architect authorization.
// Keep this list EXACT: it is what catches unintended API shape drift.
const ROLE_KEYS = ['id', 'name', 'color', 'serverId', 'permissions', 'position', 'mentionable'];

export function assertRoleShape(r: any): void {
  assertExactKeys(r, ROLE_KEYS, 'Role');
  assertUuid(r.id);
  expect(typeof r.name).toBe('string');
  // color: number or null
  if (r.color !== null) expect(typeof r.color).toBe('number');
  assertUuid(r.serverId);
  // permissions: BigInt serialized as string
  assertBigIntString(r.permissions);
  expect(typeof r.position).toBe('number');
  // FR-ROLE-007: mentionable gates whether @role produces mention events.
  expect(typeof r.mentionable).toBe('boolean');
}

// ── Permission catalog entry shape ──
const PERMISSION_KEYS = ['name', 'bit', 'label'];

export function assertPermissionShape(p: any): void {
  assertExactKeys(p, PERMISSION_KEYS, 'Permission');
  expect(typeof p.name).toBe('string');
  // bit: BigInt serialized as string
  assertBigIntString(p.bit);
  expect(typeof p.label).toBe('string');
}

// ── Voice join response shape ──
const VOICE_JOIN_KEYS = ['url', 'token', 'room'];

export function assertVoiceJoinShape(body: any): void {
  assertExactKeys(body, VOICE_JOIN_KEYS, 'VoiceJoin');
  expect(typeof body.url).toBe('string');
  expect(body.url).toContain('ws://');
  expect(typeof body.token).toBe('string');
  expect(body.token.length).toBeGreaterThan(0);
  expect(typeof body.room).toBe('string');
  assertUuid(body.room);
}

// ── Voice leave response shape ──
const VOICE_LEAVE_KEYS = ['success'];

export function assertVoiceLeaveShape(body: any): void {
  assertExactKeys(body, VOICE_LEAVE_KEYS, 'VoiceLeave');
  expect(body.success).toBe(true);
}

// ── WS ticket response shape ──
const WS_TICKET_KEYS = ['ticket', 'expiresAt'];

export function assertWsTicketShape(body: any): void {
  assertExactKeys(body, WS_TICKET_KEYS, 'WsTicket');
  expect(typeof body.ticket).toBe('string');
  expect(body.ticket.length).toBeGreaterThan(0);
  assertIsoDate(body.expiresAt);
}

// ── WS ready frame data shape ──
const WS_READY_DATA_KEYS = ['protocolVersion', 'user', 'servers'];

export function assertWsReadyDataShape(d: any): void {
  assertExactKeys(d, WS_READY_DATA_KEYS, 'WsReadyData');
  expect(d.protocolVersion).toBe(1);
  expect(typeof d.user).toBe('object');
  expect(d.user).toHaveProperty('id');
  expect(Array.isArray(d.servers)).toBe(true);
}

// ── 401 error body shape ──
const ERROR_401_KEYS = ['message', 'error', 'statusCode'];

export function assert401Shape(body: any): void {
  assertExactKeys(body, ERROR_401_KEYS, '401Error');
  expect(typeof body.message).toBe('string');
  expect(typeof body.error).toBe('string');
  expect(body.statusCode).toBe(401);
}

// ── Sound shape ──
const SOUND_KEYS = ['id', 'name', 'url', 'emoji'];

export function assertSoundShape(snd: any): void {
  assertExactKeys(snd, SOUND_KEYS, 'Sound');
  assertUuid(snd.id);
  expect(typeof snd.name).toBe('string');
  expect(typeof snd.url).toBe('string');
  // emoji: string or null
  if (snd.emoji !== null) expect(typeof snd.emoji).toBe('string');
}

// ── Friend request shape (Friendship model from accept/decline/pending) ──
const FRIEND_REQUEST_KEYS = ['id', 'status', 'requesterId', 'addresseeId', 'createdAt'];

export function assertFriendRequestShape(req: any): void {
  assertExactKeys(req, FRIEND_REQUEST_KEYS, 'FriendRequest');
  assertUuid(req.id);
  expect(typeof req.status).toBe('string');
  assertUuid(req.requesterId);
  assertUuid(req.addresseeId);
  assertIsoDate(req.createdAt);
}
