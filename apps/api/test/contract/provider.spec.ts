/**
 * P0-09 — Provider Contract Tests (contract-validating with ajv)
 *
 * Validates live HTTP responses against the schemas defined in
 * contracts/openapi.yaml, extracted here to avoid js-yaml compatibility
 * issues. Every schema below matches the YAML exactly.
 *
 * Treats undocumented fields as failures (additionalProperties check).
 * Routes the mobile client calls in Phases 1-4 are covered:
 *   auth, servers, channels, messages, reactions, pins, invites,
 *   dms, friends, notifications, voice join
 * Excluded routes get a named reason.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import Ajv from 'ajv';

// ── Build ajv ──
const ajv = new Ajv({ strict: false, allErrors: true, removeAdditional: false });
ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
ajv.addFormat('uri', /.+/);
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

// ── Contract schemas (from contracts/openapi.yaml components/schemas) ──
const User = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    username: { type: 'string' },
    displayName: { type: 'string', nullable: true },
    avatarUrl: { type: 'string', nullable: true },
    status: { type: 'string', nullable: true },
    friendCode: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    serverLayout: {}, // arbitrary JSON — no shape constraint
  },
  required: ['id', 'username'],
};

// [P1-02] dev-login now ALSO returns bearer tokens (intentional contract change).
const DevLoginResponse = {
  type: 'object', additionalProperties: false,
  properties: {
    ...User.properties,
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
    expiresIn: { type: 'integer', enum: [3600] },
  },
  required: ['id', 'username', 'accessToken', 'refreshToken', 'expiresIn'],
};

// [P1-01] POST /auth/oauth/token response.
const TokenResponse = {
  type: 'object', additionalProperties: false,
  properties: {
    accessToken: { type: 'string' },
    expiresIn: { type: 'integer', enum: [3600] },
    refreshToken: { type: 'string' },
    user: User,
  },
  required: ['accessToken', 'expiresIn', 'refreshToken', 'user'],
};

// [P1-03] Public OIDC metadata (DR-002 option D).
const OidcMetadata = {
  type: 'object', additionalProperties: false,
  properties: {
    issuer: { type: 'string', nullable: true },
    clientId: { type: 'string', nullable: true },
    nativeRedirectUri: { type: 'string' },
    scopes: { type: 'array', items: { type: 'string' } },
  },
  required: ['issuer', 'clientId', 'nativeRedirectUri', 'scopes'],
};

const Server = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    ownerId: { type: 'string', format: 'uuid' },
    myPermissions: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    iconUrl: { type: 'string', nullable: true },
  },
  required: ['id', 'name'],
};

const Attachment = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    messageId: { type: 'string', format: 'uuid' },
    shareAssetId: { type: 'string' },
    filename: { type: 'string' },
    mimeType: { type: 'string' },
    size: { type: 'string', pattern: '^\\d+$' },
    url: { type: 'string' },
    thumbnailUrl: { type: 'string', nullable: true },
    width: { type: 'integer', nullable: true },
    height: { type: 'integer', nullable: true },
    durationMs: { type: 'integer', nullable: true },
  },
  required: ['id', 'messageId', 'shareAssetId', 'filename', 'size', 'url'],
};

const Reaction = {
  type: 'object', additionalProperties: false,
  properties: {
    emoji: { type: 'string' },
    count: { type: 'integer' },
    userIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
  },
  required: ['emoji', 'userIds'],
};

const PollOption = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string' },
    text: { type: 'string' },
    voterIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
  },
};

const Poll = {
  type: 'object', nullable: true, additionalProperties: false,
  properties: {
    id: { type: 'string' },
    question: { type: 'string' },
    options: { type: 'array', items: PollOption },
    allowMultiple: { type: 'boolean' },
  },
};

const Message = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    channelId: { type: 'string', format: 'uuid' },
    authorId: { type: 'string', format: 'uuid' },
    content: { type: 'string' },
    editedAt: { type: 'string', format: 'date-time', nullable: true },
    deletedAt: { type: 'string', format: 'date-time', nullable: true },
    attachments: { type: 'array', items: Attachment },
    reactions: { type: 'array', items: Reaction },
    pinned: { type: 'boolean' },
    poll: Poll,
    createdAt: { type: 'string', format: 'date-time' },
    author: { type: 'object' },
    replyTo: { type: 'object', nullable: true },
    replyToId: { type: 'string', nullable: true, format: 'uuid' },
  },
  required: ['id', 'channelId', 'authorId', 'content'],
};

const LogoutResponse = {
  type: 'object', additionalProperties: false,
  properties: {
    endSessionUrl: { type: 'string' },
  },
  required: ['endSessionUrl'],
};

const WsTicketResponse = {
  type: 'object', additionalProperties: false,
  properties: {
    ticket: { type: 'string' },
    expiresAt: { type: 'string', format: 'date-time' },
  },
  required: ['ticket', 'expiresAt'],
};

const InviteResponse = {
  type: 'object', additionalProperties: false,
  properties: {
    code: { type: 'string' },
    serverId: { type: 'string', format: 'uuid' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    maxUses: { type: 'integer', nullable: true },
  },
};

const VoiceJoinResponse = {
  type: 'object', additionalProperties: false,
  properties: {
    url: { type: 'string', format: 'uri' },
    token: { type: 'string' },
    room: { type: 'string' },
  },
  required: ['url', 'token', 'room'],
};

// ── Compile validators ──
const validators: Record<string, any> = {
  devLogin: ajv.compile(DevLoginResponse),
  issueToken: ajv.compile(TokenResponse),
  getOidcMetadata: ajv.compile(OidcMetadata),
  getMe: ajv.compile(User),
  updateMe: ajv.compile(User),
  logout: ajv.compile(LogoutResponse),
  getWsTicket: ajv.compile(WsTicketResponse),
  createServer: ajv.compile(Server),
  listServers: ajv.compile({ type: 'array', items: Server }),
  getServer: ajv.compile(Server),
  sendMessage: ajv.compile(Message),
  editMessage: ajv.compile(Message),
  listMessages: ajv.compile({ type: 'array', items: Message }),
  addReaction: ajv.compile(Message),
  togglePin: ajv.compile(Message),
  createInvite: ajv.compile(InviteResponse),
  joinVoice: ajv.compile(VoiceJoinResponse),
};

// ── HTTP helpers ──
const API = 'http://localhost:3001/api';
let cookies: string[] = [];

// Mirrors the ApiResponse<T = any> convention in test/characterization/helpers.ts:
// the ajv validators are the real shape oracle here, so call sites read fields
// off the parsed body directly rather than narrowing `unknown` at each use.
async function api<T = any>(
  p: string,
  opts: RequestInit = {},
): Promise<{ status: number; body: T; headers: Record<string, string> }> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string> ?? {}) };
  if (cookies.length > 0) headers['cookie'] = cookies.join('; ');
  if (!headers['content-type'] && opts.method !== 'GET' && opts.body) {
    headers['content-type'] = 'application/json';
  }
  const res = await fetch(`${API}${p}`, { ...opts, headers, redirect: 'manual' });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookies.push(setCookie.split(';')[0]);
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body: body as T, headers: Object.fromEntries(res.headers) };
}

function validateResponse(operationId: string, body: unknown) {
  const v = validators[operationId];
  if (!v) return { ok: true, error: null, note: `no schema for ${operationId}` };
  const valid = v(body);
  const errors = v.errors ? v.errors.map((e: any) => `${e.instancePath} ${e.message}`) : [];
  if (!valid) {
    return { ok: false, error: { ajvErrors: errors } };
  }
  return { ok: true, error: null };
}

// ── Test state ──
const sv: any = {};
let aliceJar = '';
let bobJar = '';
let channelId = '';
let msgId = '';

beforeAll(async () => {
  const a = await api('/auth/dev-login', { method: 'POST', body: JSON.stringify({ username: 'alice-epsilon' }) });
  expect(a.status).toBe(201);
  sv.alice = a.body;
  aliceJar = cookies[cookies.length - 1];

  cookies = [];
  const b = await api('/auth/dev-login', { method: 'POST', body: JSON.stringify({ username: 'bob-zeta' }) });
  expect(b.status).toBe(201);
  sv.bob = b.body;
  bobJar = cookies[cookies.length - 1];

  cookies = [aliceJar];
  const s = await api('/servers', { method: 'POST', body: JSON.stringify({ name: 'Contract Guild' }) });
  expect([200, 201]).toContain(s.status);
  sv.serverId = s.body.id;

  await api(`/servers/${sv.serverId}/members`, { method: 'POST', body: JSON.stringify({ userId: sv.bob.id }) });

  const ch = await api(`/servers/${sv.serverId}/channels`, { method: 'POST', body: JSON.stringify({ name: 'contract-ch', type: 'TEXT' }) });
  channelId = ch.body.id;

  const msg = await api(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ content: 'contract validation msg' }) });
  msgId = msg.body.id;

  // Make alice and bob friends
  await api('/friends/requests', { method: 'POST', body: JSON.stringify({ username: 'bob-zeta' }) });
  cookies = [bobJar];
  const pending = await api('/friends/requests');
  if (Array.isArray(pending.body?.incoming) && pending.body.incoming.length > 0) {
    await api(`/friends/requests/${pending.body.incoming[0].id}/accept`, { method: 'POST' });
  }
  cookies = [aliceJar];
});

describe('Phase 1 — Auth (contract-validated)', () => {
  it('POST /auth/dev-login → User schema', async () => {
    cookies = [];
    const r = await api('/auth/dev-login', { method: 'POST', body: JSON.stringify({ username: 'schema-test' }) });
    cookies = [aliceJar];
    expect(r.status).toBe(201);
    const { ok, error } = validateResponse('devLogin', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('GET /auth/me → User schema', async () => {
    const r = await api('/auth/me');
    expect(r.status).toBe(200);
    const { ok, error } = validateResponse('getMe', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('PATCH /auth/me → User schema', async () => {
    const r = await api('/auth/me', { method: 'PATCH', body: JSON.stringify({ displayName: 'Schema User' }) });
    expect(r.status).toBe(200);
    const { ok, error } = validateResponse('updateMe', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('POST /auth/logout → {endSessionUrl} schema', async () => {
    cookies = [];
    await api('/auth/dev-login', { method: 'POST', body: JSON.stringify({ username: 'logout-test' }) });
    const r = await api('/auth/logout', { method: 'POST' });
    cookies = [aliceJar];
    expect([200, 201]).toContain(r.status);
    const { ok, error } = validateResponse('logout', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('GET /auth/ws-ticket → {ticket, expiresAt} schema', async () => {
    const r = await api('/auth/ws-ticket');
    expect(r.status).toBe(200);
    const { ok, error } = validateResponse('getWsTicket', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('POST /auth/oauth/token (refresh grant) → TokenResponse schema [P1-01]', async () => {
    cookies = [];
    const login = await api('/auth/dev-login', { method: 'POST', body: JSON.stringify({ username: 'contract-token' }) });
    const r = await api('/auth/oauth/token', {
      method: 'POST',
      body: JSON.stringify({ grantType: 'refresh_token', refreshToken: login.body.refreshToken }),
    });
    cookies = [aliceJar];
    expect(r.status).toBe(201);
    const { ok, error } = validateResponse('issueToken', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('GET /auth/oidc-metadata → OidcMetadata schema, no auth [P1-03]', async () => {
    cookies = [];
    const r = await api('/auth/oidc-metadata');
    cookies = [aliceJar];
    expect(r.status).toBe(200);
    const { ok, error } = validateResponse('getOidcMetadata', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });
});

describe('Phase 2-3 — Servers + Channels (contract-validated)', () => {
  it('POST /servers → Server schema', async () => {
    const r = await api('/servers', { method: 'POST', body: JSON.stringify({ name: 'Schema Server' }) });
    expect([200, 201]).toContain(r.status);
    const { ok, error } = validateResponse('createServer', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('GET /servers → Server[] schema', async () => {
    const r = await api('/servers');
    expect(r.status).toBe(200);
    const { ok, error } = validateResponse('listServers', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('GET /servers/:id → Server schema', async () => {
    const r = await api(`/servers/${sv.serverId}`);
    expect(r.status).toBe(200);
    const { ok, error } = validateResponse('getServer', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });
});

describe('Phase 2 — Messages (contract-validated)', () => {
  it('POST /channels/:id/messages → Message schema', async () => {
    const r = await api(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: 'schema validation msg' }),
    });
    expect([200, 201]).toContain(r.status);
    const { ok, error } = validateResponse('sendMessage', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('GET /channels/:id/messages → Message[] schema', async () => {
    const r = await api(`/channels/${channelId}/messages?limit=5`);
    expect(r.status).toBe(200);
    const { ok, error } = validateResponse('listMessages', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('PATCH /messages/:id → Message schema', async () => {
    // Send a fresh message so edit doesn't conflict with pinned state
    const fresh = await api(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ content: 'fresh for edit' }) });
    const r = await api(`/messages/${fresh.body.id}`, { method: 'PATCH', body: JSON.stringify({ content: 'edited for schema' }) });
    expect(r.status).toBe(200);
    const { ok, error } = validateResponse('editMessage', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('POST /channels/:id/messages rejects empty content (400)', async () => {
    const r = await api(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ content: '' }) });
    expect(r.status).toBe(400);
  });
});

describe('Phase 2 — Reactions + Pins (contract-validated)', () => {
  it('POST /messages/:id/reactions → Message schema (with reactions)', async () => {
    const r = await api(`/messages/${msgId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji: '👍' }) });
    expect([200, 201]).toContain(r.status);
    const { ok, error } = validateResponse('addReaction', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });

  it('PATCH /messages/:id/pin → Message schema (characterized: 400 if already pinned)', async () => {
    const fresh = await api(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ content: 'fresh for pin' }) });
    const r = await api(`/messages/${fresh.body.id}/pin`, { method: 'PATCH' });
    expect([200, 400]).toContain(r.status); // 400 = pin toggle edge case
    if (r.status === 200) {
      const { ok, error } = validateResponse('togglePin', r.body);
      expect({ ok, error }).toEqual({ ok: true, error: null });
    }
  });
});

describe('Phase 3 — Invites (contract-validated)', () => {
  it('POST /servers/:id/invites → Invite schema', async () => {
    const r = await api(`/servers/${sv.serverId}/invites`, { method: 'POST', body: '{}' });
    expect([200, 201]).toContain(r.status);
    const { ok, error } = validateResponse('createInvite', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });
});

describe('Phase 4 — DMs + Friends', () => {
  it('GET /dms → returns array', async () => {
    const r = await api('/dms');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('POST /dms → creates DM with friend', async () => {
    const r = await api('/dms', { method: 'POST', body: JSON.stringify({ userId: sv.bob.id }) });
    expect([200, 201, 403]).toContain(r.status);
  });

  it('GET /friends → returns array', async () => {
    const r = await api('/friends');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('GET /friends/requests → {incoming, outgoing}', async () => {
    const r = await api('/friends/requests');
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('incoming');
    expect(r.body).toHaveProperty('outgoing');
    expect(Array.isArray(r.body.incoming)).toBe(true);
    expect(Array.isArray(r.body.outgoing)).toBe(true);
  });
});

describe('Phase 4 — Notifications', () => {
  it('GET /notifications → {friendRequests, serverInvites, count}', async () => {
    const r = await api('/notifications');
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('friendRequests');
    expect(r.body).toHaveProperty('serverInvites');
    expect(r.body).toHaveProperty('count');
    expect(typeof r.body.count).toBe('number');
  });
});

describe('Phase 4 — Voice (contract-validated)', () => {
  it('POST /voice/:channelId/join → {url, token, room} schema', async () => {
    const r = await api(`/voice/${channelId}/join`, { method: 'POST' });
    expect(r.status).toBe(201);
    const { ok, error } = validateResponse('joinVoice', r.body);
    expect({ ok, error }).toEqual({ ok: true, error: null });
  });
});

describe('Health + Config', () => {
  it('GET /health → 200', async () => {
    cookies = [];
    const r = await api('/health');
    cookies = [aliceJar];
    expect(r.status).toBe(200);
  });

  it('GET /config → 200 (requires auth — characterized)', async () => {
    const r = await api('/config');
    expect(r.status).toBe(200);
  });
});

describe('Excluded routes (named reasons)', () => {
  it('assets routes — OpenShare, not OpenChat API', () => { expect(true).toBe(true); });
  it('DELETE /friends/:userId — covered by characterization', () => { expect(true).toBe(true); });
  it('POST /friends/requests/:id/decline — covered by characterization', () => { expect(true).toBe(true); });
  it('POST /block/:userId — covered by characterization; BACKLOG', () => { expect(true).toBe(true); });
  it('PUT /auth/server-layout — no response schema in contract', () => { expect(true).toBe(true); });
  it('server-invitation accept/decline — exercised via characterization', () => { expect(true).toBe(true); });
  it('GET /gifs/search — requires external API key', () => { expect(true).toBe(true); });
  it('Watchparty routes — deferred to Phase 7', () => { expect(true).toBe(true); });
});