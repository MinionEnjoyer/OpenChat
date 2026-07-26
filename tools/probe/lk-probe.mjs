#!/usr/bin/env node
/**
 * lk-probe.mjs — join a LiveKit room as a subscriber, sample WebRTC stats,
 *               and assert audio frames are actually flowing.
 *
 * Usage:
 *   node tools/probe/lk-probe.mjs --room <name> [--expect-participants N]
 *        [--min-packets N] [--duration seconds] [--min-audio-level N]
 *
 * Defaults:
 *   --expect-participants  2     (publisher + probe)
 *   --min-packets           50    (packetsReceived delta over the window)
 *   --duration              10    seconds to sample stats
 *   --min-audio-level       0.01  (minimum observed audioLevel)
 *
 * The probe subscribes to all remote audio tracks and samples WebRTC stats
 * every second from the underlying RTCPeerConnection. At the end of the window
 * it reports per-participant track presence, packetsReceived delta, and
 * observed audioLevel.
 *
 * Exits 0 if ALL assertions pass, non-zero with a clear message on failure.
 *
 * CRITICAL DESIGN NOTE:
 * Silence is NOT a valid signal. With DTX / silence suppression, two idle
 * participants can produce almost no RTP packets. The probe relies on a KNOWN
 * injected 440 Hz tone (from lk-fake-publisher.mjs) to produce a meaningful
 * packet stream.
 *
 * Thresholds chosen:
 *   - min-packets=50: 48 kHz mono Opus @ ~32 kbps sends roughly 50 packets/s.
 *     Over a 10s window, a working call sends ~500 packets. We set 50 as a
 *     floor to account for potential startup jitter and short windows.
 *   - min-audio-level=0.01: A 440 Hz sine at -1 dBFS should produce levels
 *     well above 0.01. Typical silence has levels near 0.0001-0.001.
 *
 * Credentials derived from apps/api/.env (LIVEKIT_API_KEY / LIVEKIT_API_SECRET).
 * Do NOT hardcode.
 *
 * @satisfies FR-VOX-001 acceptance criterion: assert via LiveKit stats API.
 */

import { parseArgs } from 'node:util';

// ── Polyfill WebRTC for Node.js ──────────────────────────────────────────────
import wrtc from '@roamhq/wrtc';
globalThis.RTCPeerConnection = wrtc.RTCPeerConnection;
globalThis.RTCSessionDescription = wrtc.RTCSessionDescription;
globalThis.RTCIceCandidate = wrtc.RTCIceCandidate;
globalThis.MediaStream = wrtc.MediaStream;
globalThis.MediaStreamTrack = wrtc.MediaStreamTrack;

if (!MediaStreamTrack.prototype.getConstraints) {
  MediaStreamTrack.prototype.getConstraints = function () { return {}; };
}
if (!MediaStreamTrack.prototype.getSettings) {
  MediaStreamTrack.prototype.getSettings = function () { return {}; };
}
if (!MediaStreamTrack.prototype.getCapabilities) {
  MediaStreamTrack.prototype.getCapabilities = function () { return {}; };
}

// suppress unhandled rejections from RTCRtpReceiver.getStats
// (@roamhq/wrtc does not implement it, but livekit-client calls it internally)
process.on('unhandledRejection', (reason) => {
  const msg = reason && reason.message ? reason.message : '';
  if (msg.includes('Not yet implemented') && msg.includes('node-webrtc')) {
    return;
  }
  console.error('[probe] Unhandled rejection:', reason);
});

// ── CLI ──────────────────────────────────────────────────────────────────────
const { values } = parseArgs({
  options: {
    room:                  { type: 'string' },
    'expect-participants': { type: 'string', default: '2' },
    'min-packets':         { type: 'string', default: '50' },
    duration:              { type: 'string', default: '10' },
    'min-audio-level':     { type: 'string', default: '0.01' },
    identity:              { type: 'string', default: 'lk-probe' },
    'settle-seconds':      { type: 'string', default: '2' },
  },
});

if (!values.room) {
  console.error('ERROR: --room is required');
  process.exit(2);
}

const ROOM = values.room;
const EXPECT_PARTICIPANTS = parseInt(values['expect-participants'], 10);
const MIN_PACKETS = parseInt(values['min-packets'], 10);
const DURATION_S = parseFloat(values.duration);
const MIN_AUDIO_LEVEL = parseFloat(values['min-audio-level']);
const SETTLE_S = parseFloat(values['settle-seconds']);
const IDENTITY = values.identity + '-' + process.pid;

// ── Stats helpers ────────────────────────────────────────────────────────────
/**
 * Extract audio inbound-rtp stats from an RTCStatsReport-like Map.
 */
function extractAudioStats(report) {
  const result = { packetsReceived: 0, bytesReceived: 0, audioLevel: 0, trackId: null };
  if (!report) return result;
  for (const [, stat] of report) {
    if (stat.type === 'inbound-rtp') {
      // Only audio tracks
      if (stat.kind === 'audio' || stat.mediaType === 'audio' || stat.trackIdentifier) {
        result.packetsReceived = Math.max(result.packetsReceived, stat.packetsReceived || 0);
        result.bytesReceived = Math.max(result.bytesReceived, stat.bytesReceived || 0);
        if (stat.audioLevel !== undefined) result.audioLevel = Math.max(result.audioLevel, stat.audioLevel);
        if (stat.trackIdentifier && !result.trackId) result.trackId = stat.trackIdentifier;
      }
    }
  }
  return result;
}

/**
 * Get stats from the subscriber's RTCPeerConnection.
 */
async function getSubscriberStats(room) {
  try {
    const pc = room.engine?.pcManager?.publisher;
    if (pc && typeof pc.getStats === 'function') {
      return await pc.getStats();
    }
  } catch { /* not available */ }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { AccessToken } = await import('livekit-server-sdk');
  const { Room, RoomEvent, ConnectionState } = await import('livekit-client');

  const API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
  const API_SECRET = process.env.LIVEKIT_API_SECRET || 'secretsecretsecretsecretsecret12';
  const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';

  // Mint token (subscriber-only)
  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: IDENTITY,
    name: 'LK Probe',
  });
  at.addGrant({ roomJoin: true, room: ROOM, canPublish: false, canSubscribe: true });
  const token = await at.toJwt();

  const room = new Room();

  // Track subscriptions for reporting
  const subscribedTracks = [];
  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    console.error(`[probe] Track subscribed: ${track.kind} from ${participant.identity} (sid=${publication.trackSid})`);
    subscribedTracks.push({ identity: participant.identity, trackSid: publication.trackSid, kind: track.kind });
  });

  // Connect
  await room.connect(LIVEKIT_URL, token);
  console.error(`[probe] Connected to room ${ROOM} as ${IDENTITY}`);

  // Settle — wait for tracks to arrive
  console.error(`[probe] Settling for ${SETTLE_S}s to allow tracks to arrive...`);
  await new Promise((r) => setTimeout(r, SETTLE_S * 1000));

  const numRemote = room.remoteParticipants.size;
  console.error(`[probe] Remote participants: ${numRemote}`);
  console.error(`[probe] Subscribed tracks: ${subscribedTracks.length}`);

  // Take initial stats snapshot
  const initialStats = await getSubscriberStats(room);
  const initialAudio = extractAudioStats(initialStats);
  console.error(`[probe] Initial audio stats: pkts=${initialAudio.packetsReceived} bytes=${initialAudio.bytesReceived} level=${initialAudio.audioLevel}`);

  // Stats collection loop
  console.error(`[probe] Sampling stats every 1s for ${DURATION_S}s...`);
  let maxAudioLevel = 0;
  const sampleCount = Math.floor(DURATION_S);
  for (let i = 0; i < sampleCount; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const stats = await getSubscriberStats(room);
    const audio = extractAudioStats(stats);
    if (audio.audioLevel > maxAudioLevel) maxAudioLevel = audio.audioLevel;
    console.error(`[probe]   t=${i + 1}s: pkts=${audio.packetsReceived} level=${audio.audioLevel.toFixed(6)}`);
  }

  // Final snapshot for delta
  const finalStats = await getSubscriberStats(room);
  const finalAudio = extractAudioStats(finalStats);
  const packetsDelta = finalAudio.packetsReceived - initialAudio.packetsReceived;

  console.error(`\n[probe] Final audio stats: pkts=${finalAudio.packetsReceived} bytes=${finalAudio.bytesReceived} level=${finalAudio.audioLevel}`);
  console.error(`[probe] Packets delta: ${packetsDelta}`);

  // ── Report ──────────────────────────────────────────────────────────────
  const totalParticipants = numRemote + 1;
  const summary = {
    room: ROOM,
    totalParticipants,
    remoteParticipants: numRemote,
    subscribedTracks,
    initialPackets: initialAudio.packetsReceived,
    finalPackets: finalAudio.packetsReceived,
    packetsDelta,
    maxAudioLevel,
  };

  console.error('\n========== PROBE REPORT ==========');
  console.error(JSON.stringify(summary, null, 2));
  console.error('==================================\n');

  // ── Assertions ──────────────────────────────────────────────────────────
  const failures = [];

  if (totalParticipants < EXPECT_PARTICIPANTS) {
    failures.push(`Expected >= ${EXPECT_PARTICIPANTS} participants, got ${totalParticipants}`);
  }

  const audioTracks = subscribedTracks.filter(t => t.kind === 'audio');
  if (audioTracks.length === 0) {
    failures.push('No remote audio tracks found — is a publisher active?');
  }

  if (packetsDelta < MIN_PACKETS) {
    failures.push(`packetsReceived delta ${packetsDelta} < min ${MIN_PACKETS} — audio not flowing or DTX suppressing`);
  }

  if (maxAudioLevel < MIN_AUDIO_LEVEL) {
    failures.push(`max audioLevel ${maxAudioLevel.toFixed(6)} < min ${MIN_AUDIO_LEVEL} — silence or near-silence detected`);
  }

  if (failures.length === 0) {
    console.log('PASS: All assertions met');
    console.log(`  Participants: ${totalParticipants}`);
    console.log(`  Audio tracks: ${audioTracks.length}`);
    console.log(`  Packets delta: ${packetsDelta}`);
    console.log(`  Max audio level: ${maxAudioLevel.toFixed(6)}`);
    await room.disconnect();
    process.exit(0);
  } else {
    console.error('FAIL: Assertion failures:');
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`  Participants: ${totalParticipants}`);
    console.error(`  Audio tracks: ${audioTracks.length}`);
    console.error(`  Packets delta: ${packetsDelta}`);
    console.error(`  Max audio level: ${maxAudioLevel.toFixed(6)}`);
    await room.disconnect();
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`[probe] FATAL: ${e.message}`);
  process.exit(2);
});
