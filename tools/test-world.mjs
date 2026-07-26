#!/usr/bin/env node
/**
 * test-world.mjs — provision a fresh, isolated E2E world via dev-login + REST APIs.
 *
 * Mirrors the contract of POST /api/dev/test-world (which a companion agent is
 * building). When the real endpoint lands, this script can become a thin wrapper
 * that calls it directly. Until then, it provisions the same shape using the
 * existing dev-login and REST endpoints.
 *
 * Outputs:
 *   1. A JSON world file at --out (default: /tmp/e2e-world-<label>.json)
 *   2. Maestro-compatible env vars printed to stdout (one per line: KEY=VALUE)
 *   3. A compact summary to stderr
 *
 * Usage:
 *   node tools/test-world.mjs [--label myrun] [--api http://localhost:3030/api] [--out /tmp/world.json]
 *
 * Env vars for Maestro (consume with `maestro test --env-file <(node ...) `):
 *   E2E_USERNAME          test user's login name
 *   E2E_SERVER_NAME       server name displayed in rail
 *   E2E_CHANNEL_GENERAL   general channel name (e.g. "general")
 *   E2E_CHANNEL_VOICE     voice channel name (e.g. "Voice")
 *   E2E_FRIEND_USERNAME   friend's login name
 *   E2E_FRIEND_CODE       friend's 8-digit code (for add-friend flow)
 *   E2E_DM_CHANNEL_ID     DM channel UUID between test user and friend
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.CHAR_API_BASE ?? 'http://localhost:3030/api';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
  };
  return {
    label: get('--label') ?? `run-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    apiBase: get('--api') ?? API_BASE,
    outFile: get('--out') ?? `/tmp/e2e-world-${(get('--label') ?? 'default')}.json`,
  };
}

// ── HTTP helper ──
class CookieJar {
  constructor() { this.store = new Map(); }
  update(raw) {
    if (!raw) return;
    for (const part of raw.split(/;\s*/)) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const k = part.slice(0, eq).toLowerCase();
      if (['path','domain','expires','max-age','httponly','secure','samesite'].includes(k)) continue;
      this.store.set(k, part.slice(eq + 1));
    }
  }
  toString() { return [...this.store.entries()].map(([k,v]) => `${k}=${v}`).join('; '); }
}

async function apiFetch(apiBase, pathStr, opts = {}) {
  const url = new URL(pathStr.startsWith('/') ? `${apiBase}${pathStr}` : pathStr);
  const method = opts.method ?? 'GET';
  const jar = opts.jar;
  const headers = { ...(opts.headers ?? {}) };
  if (jar && jar.toString()) headers['cookie'] = jar.toString();
  if (!headers['content-type'] && method !== 'GET' && opts.body !== undefined)
    headers['content-type'] = 'application/json';
  let reqBody;
  if (opts.body !== undefined) {
    reqBody = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    headers['content-length'] = String(Buffer.byteLength(reqBody));
  }
  if (opts.token) {
    headers['authorization'] = `Bearer ${opts.token}`;
  }
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      if (jar) {
        const sc = res.headers['set-cookie'];
        if (sc) { if (Array.isArray(sc)) sc.forEach(c => jar.update(c)); else jar.update(sc); }
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        let body;
        try { body = JSON.parse(raw); } catch { body = raw; }
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

// ── Unique label ──
function uid(len = 6) {
  return crypto.randomBytes(len).toString('base64url').slice(0, len).toLowerCase();
}

async function main() {
  const { label, apiBase, outFile } = parseArgs();
  const runId = uid();
  const testUsername = `e2e_${runId}`;
  const friendUsername = `e2ef_${runId}`;
  const serverName = `E2E ${label.slice(0, 20)}`;

  console.error(`[test-world] Provisioning "${label}" (user=${testUsername})…`);

  // ── 1. Wait for API ──
  for (let i = 0; i < 60; i++) {
    try {
      const r = await apiFetch(apiBase, '/health');
      if (r.status === 200) break;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }

  // ── 2. Create test user via dev-login ──
  console.error(`  Creating test user "${testUsername}"…`);
  const testJar = new CookieJar();
  const testLogin = await apiFetch(apiBase, '/auth/dev-login', {
    method: 'POST', body: { username: testUsername }, jar: testJar
  });
  if (testLogin.status < 200 || testLogin.status >= 300) {
    throw new Error(`dev-login failed for ${testUsername}: ${testLogin.status} ${JSON.stringify(testLogin.body)}`);
  }
  const testUser = testLogin.body;
  const testToken = testUser.accessToken;
  console.error(`    userId=${testUser.id}`);

  // ── 3. Create server ──
  console.error(`  Creating server "${serverName}"…`);
  const serverRes = await apiFetch(apiBase, '/servers', {
    method: 'POST', body: { name: serverName }, jar: testJar
  });
  if (serverRes.status < 200 || serverRes.status >= 300) {
    throw new Error(`server create failed: ${serverRes.status} ${JSON.stringify(serverRes.body)}`);
  }
  const serverId = serverRes.body.id;

  // ── 4. Get channels (server auto-creates 'general') ──
  const channelsRes = await apiFetch(apiBase, `/servers/${serverId}/channels`, { jar: testJar });
  const channels = Array.isArray(channelsRes.body) ? channelsRes.body : [];
  const generalCh = channels.find(c => c.name === 'general');
  if (!generalCh) throw new Error('No general channel found after server create');
  console.error(`    general channel: ${generalCh.id}`);

  // ── 5. Create a voice channel ──
  const voiceChName = 'Voice';
  const voiceChRes = await apiFetch(apiBase, `/servers/${serverId}/channels`, {
    method: 'POST', body: { name: voiceChName, type: 'VOICE' }, jar: testJar
  });
  if (voiceChRes.status < 200 || voiceChRes.status >= 300) {
    throw new Error(`voice channel create failed: ${voiceChRes.status} ${JSON.stringify(voiceChRes.body)}`);
  }
  const voiceChId = voiceChRes.body.id;
  console.error(`    voice channel: ${voiceChId}`);

  // ── 6. Create friend user ──
  console.error(`  Creating friend "${friendUsername}"…`);
  const friendJar = new CookieJar();
  const friendLogin = await apiFetch(apiBase, '/auth/dev-login', {
    method: 'POST', body: { username: friendUsername }, jar: friendJar
  });
  if (friendLogin.status < 200 || friendLogin.status >= 300) {
    throw new Error(`dev-login failed for ${friendUsername}: ${friendLogin.status}`);
  }
  const friendUser = friendLogin.body;
  const friendToken = friendUser.accessToken;
  console.error(`    friendId=${friendUser.id}`);

  // ── 7. Add friend to server (via invite) ──
  console.error(`  Adding friend to server…`);
  const inviteRes = await apiFetch(apiBase, `/servers/${serverId}/invites`, {
    method: 'POST', body: {}, jar: testJar
  });
  const inviteCode = inviteRes.body?.code;
  if (!inviteCode) throw new Error(`invite create failed: ${inviteRes.status}`);
  const acceptRes = await apiFetch(apiBase, `/invites/${inviteCode}/accept`, {
    method: 'POST', jar: friendJar
  });
  if (acceptRes.status >= 400) {
    throw new Error(`invite accept failed: ${acceptRes.status}`);
  }

  // ── 8. Send friend request (friend → test user) and accept ──
  console.error(`  Establishing friendship…`);
  // Get friend's friendCode
  const friendMe = await apiFetch(apiBase, '/auth/me', { token: friendToken });
  const friendCode = friendMe.body?.friendCode;
  if (!friendCode) throw new Error('Friend user has no friendCode');

  // Test user sends request to friend by friendCode
  const reqRes = await apiFetch(apiBase, '/friends/requests', {
    method: 'POST', body: { friendCode }, jar: testJar
  });
  if (reqRes.status >= 400) {
    throw new Error(`friend request failed: ${reqRes.status} ${JSON.stringify(reqRes.body)}`);
  }

  // Friend accepts incoming request
  const pendingRes = await apiFetch(apiBase, '/friends/requests', { jar: friendJar });
  const incomingList = pendingRes.body?.incoming ?? [];
  const incoming = incomingList.find(r => r.user?.id === testUser.id);
  if (!incoming) throw new Error(`Friend request not visible to friend. incoming=${JSON.stringify(incomingList)}`);
  const acceptFriendRes = await apiFetch(apiBase, `/friends/requests/${incoming.id}/accept`, {
    method: 'POST', jar: friendJar
  });
  if (acceptFriendRes.status >= 400) {
    throw new Error(`friend accept failed: ${acceptFriendRes.status}`);
  }

  // ── 9. Create and get DM channel ──
  console.error(`  Creating DM channel…`);
  const dmCreateRes = await apiFetch(apiBase, '/dms', {
    method: 'POST', body: { userId: friendUser.id }, jar: testJar
  });
  const dmsRes = await apiFetch(apiBase, '/dms', { jar: testJar });
  const dms = Array.isArray(dmsRes.body) ? dmsRes.body : [];
  const dm = dms.find(d => d.type === 'DM');
  const dmChannelId = dm?.id;
  if (!dmChannelId) {
    console.error('  WARNING: no DM channel found — some flows will break');
  } else {
    console.error(`    dmChannelId=${dmChannelId}`);
  }

  // ── 10. Send a few seed messages in #general ──
  console.error(`  Seeding messages…`);
  const messages = [];
  for (const text of ['Hello from test world!', 'This is a fresh environment.', 'E2E ready.']) {
    const msgRes = await apiFetch(apiBase, `/channels/${generalCh.id}/messages`, {
      method: 'POST', body: { content: text }, jar: testJar
    });
    if (msgRes.status >= 200 && msgRes.status < 300) {
      messages.push(msgRes.body.id);
    }
  }
  console.error(`    ${messages.length} messages seeded`);

  // ── Build world object matching the contract ──
  const world = {
    username: testUsername,
    userId: testUser.id,
    tokens: {
      accessToken: testToken,
      refreshToken: testUser.refreshToken,
    },
    fixtures: {
      serverId,
      serverName,
      channels: {
        general: generalCh.id,
        generalName: generalCh.name,
        voice: voiceChId,
        voiceName: voiceChName,
      },
      friend: {
        userId: friendUser.id,
        username: friendUsername,
        friendCode,
        token: friendToken,
      },
      dmChannelId: dmChannelId ?? null,
      messageIds: messages,
    },
    meta: { label, runId, createdAt: new Date().toISOString() },
  };

  // ── Write JSON world file ──
  fs.writeFileSync(outFile, JSON.stringify(world, null, 2));
  console.error(`  World written to ${outFile}`);

  // ── Print Maestro-compatible env vars to stdout ──
  const envVars = {
    E2E_USERNAME: testUsername,
    E2E_USER_ID: testUser.id,
    E2E_SERVER_NAME: serverName,
    E2E_SERVER_ID: serverId,
    E2E_CHANNEL_GENERAL: generalCh.name,
    E2E_CHANNEL_GENERAL_ID: generalCh.id,
    E2E_CHANNEL_VOICE: voiceChName,
    E2E_CHANNEL_VOICE_ID: voiceChId,
    E2E_FRIEND_USERNAME: friendUsername,
    E2E_FRIEND_USER_ID: friendUser.id,
    E2E_FRIEND_CODE: friendCode,
    E2E_FRIEND_TOKEN: friendToken,
    E2E_DM_CHANNEL_ID: dmChannelId ?? '',
  };

  for (const [k, v] of Object.entries(envVars)) {
    process.stdout.write(`${k}=${v}\n`);
  }

  console.error('[test-world] Done.');
}

main().catch((err) => {
  console.error(`[test-world] FATAL: ${err.message}`);
  process.exit(1);
});
