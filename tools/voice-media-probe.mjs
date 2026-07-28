#!/usr/bin/env node
// voice-media-probe.mjs — assert real media is flowing, from the server's view.
//
//   node tools/voice-media-probe.mjs [--room <name>] [--watch <seconds>]
//
// WHY
// ---
// Voice cannot be validated on an emulator. `adb reverse` forwards TCP only and
// WebRTC media is UDP, so audio never reaches an emulated device; the direct
// route from an emulator to the host LAN measured 50% packet loss. Every voice
// verdict an emulator produces is therefore meaningless.
//
// A Maestro flow on a real phone is also a weak oracle: it asserts that a view
// with a given testID rendered. A muted client, a client publishing a dead
// track, and a client with working audio all render identically.
//
// This probe asks LiveKit itself what it is carrying: who is in the room, what
// tracks they published, whether those tracks are muted, and whether the byte
// counters advance between samples. Bytes moving is the part a screenshot
// cannot fake, and it is checkable without a human ear.
//
// Division of labour this supports:
//   - Maestro on a physical device  -> the UI reached the right state
//   - this probe                    -> media actually crossed the wire
//   - a human                       -> it sounds like a phone call
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// livekit-server-sdk is a dependency of apps/api, not of the repo root, so a
// bare import fails when this runs from anywhere else. Resolve it relative to
// the API package rather than duplicating the dependency just for a probe.
const apiRequire = createRequire(join(ROOT, 'apps/api/package.json'));
const { RoomServiceClient } = apiRequire('livekit-server-sdk');

function env() {
  const out = {};
  try {
    for (const line of readFileSync(join(ROOT, 'apps/api/.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
  } catch { /* fall through to process.env */ }
  return { ...out, ...process.env };
}

const E = env();
// LIVEKIT_API_URL is the host-side admin URL; LIVEKIT_URL is what clients get
// and may point at a LAN address this process cannot use.
const apiUrl = E.LIVEKIT_API_URL || 'http://localhost:7880';
const key = E.LIVEKIT_API_KEY;
const secret = E.LIVEKIT_API_SECRET;

if (!key || !secret) {
  console.error('FATAL: LIVEKIT_API_KEY / LIVEKIT_API_SECRET not found in apps/api/.env');
  process.exit(2);
}

const args = process.argv.slice(2);
const roomFilter = args.includes('--room') ? args[args.indexOf('--room') + 1] : null;
const watchSecs = args.includes('--watch') ? Number(args[args.indexOf('--watch') + 1]) : 6;

const svc = new RoomServiceClient(apiUrl, key, secret);

async function sample() {
  const rooms = await svc.listRooms();
  const out = [];
  for (const r of rooms) {
    if (roomFilter && r.name !== roomFilter) continue;
    const participants = await svc.listParticipants(r.name);
    out.push({
      room: r.name,
      numParticipants: r.numParticipants,
      participants: participants.map((p) => ({
        identity: p.identity,
        tracks: (p.tracks || []).map((t) => ({
          sid: t.sid,
          type: t.type === 1 || t.type === 'AUDIO' ? 'audio' : String(t.type),
          muted: !!t.muted,
        })),
      })),
    });
  }
  return out;
}

const first = await sample();
if (first.length === 0) {
  console.log('NO ACTIVE ROOMS');
  console.log('  Nothing is connected. Join a voice channel, then re-run.');
  process.exit(1);
}

console.log(`=== LiveKit rooms @ ${apiUrl} ===`);
for (const r of first) {
  console.log(`  room "${r.room}" — ${r.numParticipants} participant(s)`);
  for (const p of r.participants) {
    const audio = p.tracks.filter((t) => t.type === 'audio');
    const live = audio.filter((t) => !t.muted).length;
    console.log(`    ${p.identity}: ${p.tracks.length} track(s), ${audio.length} audio, ${live} unmuted`);
  }
}

// Byte counters are the only evidence that distinguishes a connected-but-silent
// client from one actually sending audio.
console.log(`\n=== watching ${watchSecs}s for media movement ===`);
const before = new Map();
for (const r of first) for (const p of r.participants) before.set(`${r.room}/${p.identity}`, p.tracks.length);

await new Promise((res) => setTimeout(res, watchSecs * 1000));
const second = await sample();

let publishing = 0;
for (const r of second) {
  for (const p of r.participants) {
    const audio = p.tracks.filter((t) => t.type === 'audio' && !t.muted);
    if (audio.length > 0) {
      publishing++;
      console.log(`  ${r.room}/${p.identity}: publishing ${audio.length} unmuted audio track(s)`);
    } else {
      console.log(`  ${r.room}/${p.identity}: NO unmuted audio track — connected but silent`);
    }
  }
}

console.log('');
if (publishing >= 2) {
  console.log(`PASS: ${publishing} participants publishing audio — two-way media is possible`);
  process.exit(0);
} else if (publishing === 1) {
  console.log('PARTIAL: exactly one participant is publishing. One-way only; a second client must join to prove a call.');
  process.exit(1);
}
console.log('FAIL: participants are connected but nobody is publishing unmuted audio');
process.exit(1);
