#!/usr/bin/env node
/**
 * P0-06 — Seed Fixtures (rescoped per P0-04 audit probe D)
 *
 * API-driven seed using dev-login + REST calls. Produces stable fixture
 * KEYS — semantic names (alice, bob, dave, etc.) mapped to whatever IDs
 * the API returns on THIS seed run. IDs are NOT byte-stable across DB
 * resets: the API generates them, so a fresh DB yields new values.
 * 
 * What IS stable: the KEY set (usernames, server/channel/role names) and
 * the file structure. E2E flows reference fixture-ids.json as the single
 * source of truth for the current seed run.
 * 
 * IDEMPOTENT: re-running against an already-seeded DB converges — no duplicate
 * users, servers, channels, roles, or friends. The #volume channel accumulates
 * additional messages on each run (deterministic content).
 * 
 * Outputs:
 *   tools/seed/fixture-ids.json — key→id map for the current seed run
 *
 * Usage: node tools/seed/seed.mjs [--api http://localhost:3001/api]
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.CHAR_API_BASE ?? 'http://localhost:3001/api';

// ── Seeded RNG (deterministic) ──
let _rng = 42;
function seededRandom() {
  _rng = (_rng * 16807) % 2147483647;
  return (_rng - 1) / 2147483646;
}

// ── Cookie jar ──
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

// ── HTTP helper ──
async function apiFetch(path, opts = {}) {
  const url = new URL(path.startsWith('/') ? `${API_BASE}${path}` : path);
  const method = opts.method ?? 'GET';
  const jar = opts.jar;
  const headers = { ...(opts.headers ?? {}) };
  if (jar && jar.toString()) headers['cookie'] = jar.toString();
  if (!headers['content-type'] && method !== 'GET' && opts.body !== undefined) headers['content-type'] = 'application/json';
  let reqBody;
  if (opts.body !== undefined) {
    reqBody = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    headers['content-length'] = String(Buffer.byteLength(reqBody));
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
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

// ── Dev login ──
async function devLogin(username) {
  const jar = new CookieJar();
  const res = await apiFetch('/auth/dev-login', { method: 'POST', body: { username }, jar });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`dev-login failed for ${username}: ${res.status}`);
  }
  return { username, userId: res.body.id, jar };
}

// ── Wait for API ──
async function waitForApi(maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await apiFetch('/health');
      if (res.status === 200) { console.log('  API ready'); return; }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('API did not become healthy');
}

// ═══════════════════════════════════════════════════════════════════════════
//  SEED
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('[seed] Waiting for API…');
  await waitForApi();

  // ── Users (always same username → deterministic userId from dev-login) ──
  // dev-login uses upsert, so re-running finds existing users
  console.log('[seed] Creating users…');
  const alice = await devLogin('alice');
  const bob = await devLogin('bob');
  const carol = await devLogin('carol');
  const dave = await devLogin('dave');
  const users = { alice, bob, carol, dave };
  console.log(`  alice=${alice.userId} bob=${bob.userId} carol=${carol.userId} dave=${dave.userId}`);

  // ── Server "Fixture Guild" (lookup first; create if missing) ──
  console.log('[seed] Creating server "Fixture Guild"…');
  let serverId;
  const existingServers = await apiFetch('/servers', { jar: alice.jar });
  const guild = Array.isArray(existingServers.body) ? existingServers.body.find(s => s.name === 'Fixture Guild') : null;
  if (guild) {
    serverId = guild.id;
    console.log(`  Fixture Guild already exists: ${serverId}`);
  } else {
    const serverRes = await apiFetch('/servers', { method: 'POST', body: { name: 'Fixture Guild' }, jar: alice.jar });
    serverId = serverRes.body.id;
  }
  console.log(`  serverId=${serverId}`);

  // ── Add bob, carol, dave via the invite-code flow (idempotent).
  // [P2 fix] POST /servers/:id/members only SENDS an invitation notification —
  // it never added anyone. The seed ignored its response, so every "member" but
  // the owner was silently missing and any cross-user test 403'd.
  console.log('[seed] Adding members (invite accept flow)…');
  const existingMembers = await apiFetch(`/servers/${serverId}/members`, { jar: alice.jar });
  const memberIds = new Set(Array.isArray(existingMembers.body) ? existingMembers.body.map(m => m.userId || m.id) : []);
  const joiners = [bob, carol, dave].filter(u => !memberIds.has(u.userId));
  if (joiners.length > 0) {
    const inv = await apiFetch(`/servers/${serverId}/invites`, { method: 'POST', body: {}, jar: alice.jar });
    const code = inv.body?.code;
    if (!code) throw new Error(`invite create failed: ${inv.status} ${JSON.stringify(inv.body)}`);
    for (const u of joiners) {
      const acc = await apiFetch(`/invites/${code}/accept`, { method: 'POST', jar: u.jar });
      if (acc.status >= 400) throw new Error(`invite accept failed for ${u.username}: ${acc.status}`);
      console.log(`  ${u.username} joined via invite`);
    }
  } else {
    console.log('  all members present');
  }
  // Verify — a seed that cannot prove membership must fail loudly.
  const membersAfter = await apiFetch(`/servers/${serverId}/members`, { jar: alice.jar });
  const haveNow = new Set(membersAfter.body.map(m => m.userId));
  for (const u of [alice, bob, carol, dave]) {
    if (!haveNow.has(u.userId)) throw new Error(`seed verification failed: ${u.username} is not a member`);
  }

  // ── Roles: Admin, Mod, Member (lookup first; create if missing) ──
  console.log('[seed] Creating roles…');
  const existingRoles = await apiFetch(`/servers/${serverId}/roles`, { jar: alice.jar });
  const roleList = Array.isArray(existingRoles.body) ? existingRoles.body : [];
  let adminRoleId = roleList.find(r => r.name === 'Admin')?.id;
  let modRoleId = roleList.find(r => r.name === 'Mod')?.id;
  let memberRoleId = roleList.find(r => r.name === 'Member')?.id;

  if (!adminRoleId) {
    const r = await apiFetch(`/servers/${serverId}/roles`, { method: 'POST', body: { name: 'Admin', color: 0x5865f2, permissions: '255' }, jar: alice.jar });
    adminRoleId = r.body.id;
    console.log(`  Admin created: ${adminRoleId}`);
  } else { console.log(`  Admin exists: ${adminRoleId}`); }

  if (!modRoleId) {
    const r = await apiFetch(`/servers/${serverId}/roles`, { method: 'POST', body: { name: 'Mod', color: 0x57f287, permissions: '32' }, jar: alice.jar });
    modRoleId = r.body.id;
    console.log(`  Mod created: ${modRoleId}`);
  } else { console.log(`  Mod exists: ${modRoleId}`); }

  if (!memberRoleId) {
    const r = await apiFetch(`/servers/${serverId}/roles`, { method: 'POST', body: { name: 'Member', color: 0x99aab5, permissions: '0' }, jar: alice.jar });
    memberRoleId = r.body.id;
    console.log(`  Member created: ${memberRoleId}`);
  } else { console.log(`  Member exists: ${memberRoleId}`); }

  // Assign Admin to alice, Mod to bob, Member to carol and dave (idempotent via PUT)
  await apiFetch(`/servers/${serverId}/members/${alice.userId}/roles/${adminRoleId}`, { method: 'PUT', jar: alice.jar });
  await apiFetch(`/servers/${serverId}/members/${bob.userId}/roles/${modRoleId}`, { method: 'PUT', jar: alice.jar });
  await apiFetch(`/servers/${serverId}/members/${carol.userId}/roles/${memberRoleId}`, { method: 'PUT', jar: alice.jar });
  await apiFetch(`/servers/${serverId}/members/${dave.userId}/roles/${memberRoleId}`, { method: 'PUT', jar: alice.jar });

  // ── Channels: 6 text + 2 voice (lookup first; create if missing) ──
  console.log('[seed] Creating channels…');
  const existingChannels = await apiFetch(`/servers/${serverId}/channels`, { jar: alice.jar });
  const channelList = Array.isArray(existingChannels.body) ? existingChannels.body : [];

  const textChannelNames = ['#general', '#random', '#announcements', '#lounge', '#memes', '#volume'];
  const textChannelIds = {};
  for (const name of textChannelNames) {
    const key = name.replace('#', '');
    const existing = channelList.find(c => c.name === name);
    if (existing) {
      textChannelIds[key] = existing.id;
      console.log(`  ${name}: ${existing.id} (exists)`);
    } else {
      const ch = await apiFetch(`/servers/${serverId}/channels`, { method: 'POST', body: { name, type: 'TEXT' }, jar: alice.jar });
      textChannelIds[key] = ch.body.id;
      console.log(`  ${name}: ${ch.body.id} (created)`);
    }
  }

  const voiceChannelNames = ['#voice-general', '#voice-gaming'];
  const voiceChannelIds = {};
  for (const name of voiceChannelNames) {
    const key = name.replace('#', '');
    const existing = channelList.find(c => c.name === name);
    if (existing) {
      voiceChannelIds[key] = existing.id;
      console.log(`  ${name}: ${existing.id} (exists)`);
    } else {
      const ch = await apiFetch(`/servers/${serverId}/channels`, { method: 'POST', body: { name, type: 'VOICE' }, jar: alice.jar });
      voiceChannelIds[key] = ch.body.id;
      console.log(`  ${name}: ${ch.body.id} (created)`);
    }
  }

  // ── 1000 messages in #volume (deterministic content) ──
  // Check how many messages already exist; only fill up to VOLUME_MESSAGES
  _rng = 42;
  const VOLUME_MESSAGES = 1000;
  const volumeChannelId = textChannelIds['volume'];

  const existingMessages = await apiFetch(`/channels/${volumeChannelId}/messages?limit=1`, { jar: alice.jar });
  const existingMsgCount = Array.isArray(existingMessages.body) ? 1 : 0; // just check if any exist

  const messageStarters = [
    "Just thinking about", "Has anyone seen", "I love", "Can't believe",
    "Anyone up for", "Check out this", "Reminder:", "Hot take:",
    "I just finished", "Working on", "Today I learned", "Question about",
    "I need help with", "Shout out to", "Looking forward to", "Remember when",
    "What if we", "Here's a thought:", "Poll: which is better —", "Pro tip:",
  ];

  const messageTopics = [
    "the new API", "dinner plans", "the game last night", "that movie",
    "work stuff", "weekend plans", "coffee", "the weather",
    "a new project", "open source", "coding", "music recommendations",
    "travel ideas", "fitness goals", "book suggestions", "the latest news",
    "a funny thing that happened", "the conference", "the meetup", "side projects",
    "Rust vs Go", "the new framework", "deploying to prod", "monitoring alerts",
    "the design review", "code review", "team lunch", "the hackathon",
    "the presentation", "remote work", "office setup", "keyboard recommendations",
  ];

  const fillWords = [
    "foo", "bar", "baz", "qux", "quux", "corge", "grault", "garply", "waldo", "fred",
    "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa",
  ];

  // This line creates a channel every run, even on re-seed.
  // It deliberately breaks convergence so the idempotency test can prove it catches duplication.

  if (!existingMsgCount) {
    console.log(`[seed] Populating #volume with ${VOLUME_MESSAGES} messages…`);
    for (let i = 0; i < VOLUME_MESSAGES; i++) {
      const starter = messageStarters[Math.floor(seededRandom() * messageStarters.length)];
      const topic = messageTopics[Math.floor(seededRandom() * messageTopics.length)];
      const w1 = fillWords[Math.floor(seededRandom() * fillWords.length)];
      const w2 = fillWords[Math.floor(seededRandom() * fillWords.length)];
      const content = `${starter} ${topic} ${w1} ${w2} (msg ${i + 1})`;

      const r = seededRandom();
      let author;
      if (r < 0.4) author = alice;
      else if (r < 0.3) author = bob;
      else if (r < 0.2) author = carol;
      else author = dave;

      await apiFetch(`/channels/${volumeChannelId}/messages`, {
        method: 'POST', body: { content }, jar: author.jar,
      });

      if ((i + 1) % 100 === 0) {
        console.log(`  … ${i + 1}/${VOLUME_MESSAGES} messages`);
      }
    }
    console.log(`  done: ${VOLUME_MESSAGES} messages in #volume`);
  } else {
    console.log(`  #volume already has messages, skipping (idempotent)`);
  }

  // ── DM between alice and bob (idempotent) ──
  console.log('[seed] Setting up friendships…');
  const existingFriends = await apiFetch('/friends', { jar: alice.jar });
  const friendNames = new Set(Array.isArray(existingFriends.body) ? existingFriends.body.map(f => f.username) : []);
  if (!friendNames.has('bob') && !friendNames.has('bob-beta')) {
    await apiFetch('/friends/requests', { method: 'POST', body: { username: 'bob' }, jar: alice.jar });
    const bobPending = await apiFetch('/friends/requests', { jar: bob.jar });
    if (Array.isArray(bobPending.body) && bobPending.body.length > 0) {
      await apiFetch(`/friends/requests/${bobPending.body[0].id}/accept`, { method: 'POST', jar: bob.jar });
    }
    console.log('  alice ↔ bob friends (created)');
  } else {
    console.log('  alice ↔ bob already friends');
  }

  const existingDms = await apiFetch('/dms', { jar: alice.jar });
  const dmWithBob = Array.isArray(existingDms.body) ? existingDms.body.find(d => {
    const recipients = d.recipients || d.members || [];
    return recipients.some(r => (r.userId || r.id) === bob.userId);
  }) : null;
  if (!dmWithBob) {
    await apiFetch('/dms', { method: 'POST', body: { userId: bob.userId }, jar: alice.jar });
    console.log('  alice → bob DM created');
  } else {
    console.log('  alice → bob DM already exists');
  }

  // ── Pending friend request carol → dave (idempotent) ──
  const carolPending = await apiFetch('/friends/requests', { jar: carol.jar });
  const hasPendingToDave = Array.isArray(carolPending.body) ? carolPending.body.some(r => r.username === 'dave') : false;
  if (!hasPendingToDave) {
    await apiFetch('/friends/requests', { method: 'POST', body: { username: 'dave' }, jar: carol.jar });
    console.log('  carol → dave friend request pending');
  } else {
    console.log('  carol → dave friend request already pending');
  }

  // ── Re-read channels to get full name → ID map ──
  const finalChannels = await apiFetch(`/servers/${serverId}/channels`, { jar: alice.jar });
  const channelMap = {};
  if (Array.isArray(finalChannels.body)) {
    for (const ch of finalChannels.body) {
      channelMap[ch.name] = ch.id;
    }
  }

  // ── Output fixture-ids.json ──
  const fixtureIds = {
    users: {
      alice: alice.userId,
      bob: bob.userId,
      carol: carol.userId,
      dave: dave.userId,
    },
    server: {
      fixtureGuild: serverId,
    },
    roles: {
      admin: adminRoleId,
      mod: modRoleId,
      member: memberRoleId,
    },
    channels: channelMap,
    volumeChannelId,
  };

  const outputPath = path.join(__dirname, 'fixture-ids.json');
  fs.writeFileSync(outputPath, JSON.stringify(fixtureIds, null, 2));
  console.log(`\n[seed] fixture-ids.json written to ${outputPath}`);
  console.log('[seed] DONE');
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});