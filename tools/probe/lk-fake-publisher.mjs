#!/usr/bin/env node
/**
 * lk-fake-publisher.mjs — join a LiveKit room and publish a 440 Hz tone fixture.
 *
 * Usage: node tools/probe/lk-fake-publisher.mjs --room <name> [--tone path] [--duration seconds]
 *
 * Connects to the live LiveKit dev server (ws://localhost:7880) using the same
 * API key/secret the backend uses. Publishes the tone as an audio track so the
 * probe listener can assert on it.
 *
 * Credentials derived from apps/api/.env (LIVEKIT_API_KEY / LIVEKIT_API_SECRET).
 * Do NOT hardcode credentials; they are read from the env.
 *
 * @satisfies FR-VOX-001: provides known injected signal for probe assertion.
 */

import { readFileSync, statSync } from 'node:fs';
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
  MediaStreamTrack.prototype.getSettings = function () { return { sampleRate: 48000, channelCount: 1 }; };
}
if (!MediaStreamTrack.prototype.getCapabilities) {
  MediaStreamTrack.prototype.getCapabilities = function () { return {}; };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const { values } = parseArgs({
  options: {
    room:     { type: 'string' },
    tone:     { type: 'string', default: 'tools/probe/tone440.wav' },
    duration: { type: 'string', default: '30' },
    identity: { type: 'string', default: 'fake-publisher' },
  },
});

if (!values.room) {
  console.error('ERROR: --room is required');
  process.exit(1);
}

const ROOM = values.room;
const TONE_PATH = values.tone;
const PUBLISH_DURATION_S = parseFloat(values.duration);
const IDENTITY = values.identity + '-' + process.pid;

// ── Read WAV file ────────────────────────────────────────────────────────────
let SAMPLE_RATE, PCM_DATA;
{
  const buf = readFileSync(TONE_PATH);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') {
    console.error(`ERROR: ${TONE_PATH} is not a valid WAV file`);
    process.exit(1);
  }
  // Parse WAV header minimally
  SAMPLE_RATE = buf.readUInt32LE(24);
  const numChannels = buf.readUInt16LE(22);
  const bitsPerSample = buf.readUInt16LE(34);
  const dataOffset = 44; // canonical
  const dataSize = buf.readUInt32LE(40);
  const numSamples = dataSize / (bitsPerSample / 8);
  console.error(`WAV: ${SAMPLE_RATE} Hz, ${numChannels}ch, ${bitsPerSample}bit, ${numSamples} samples`);

  // Convert to Float32 samples (-1..1), handle mono/stereo
  const raw = new Int16Array(buf.buffer.slice(dataOffset, dataOffset + dataSize));
  PCM_DATA = new Float32Array(raw.length / numChannels);
  for (let i = 0; i < PCM_DATA.length; i++) {
    const s = raw[i * numChannels];
    PCM_DATA[i] = s / 32768;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { AccessToken } = await import('livekit-server-sdk');
  const { Room, RoomEvent, LocalAudioTrack, ConnectionState } = await import('livekit-client');

  // Mint token
  const API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
  const API_SECRET = process.env.LIVEKIT_API_SECRET || 'secretsecretsecretsecretsecret12';
  const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';

  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: IDENTITY,
    name: 'Fake Publisher',
  });
  at.addGrant({ roomJoin: true, room: ROOM, canPublish: true, canSubscribe: false });
  const token = await at.toJwt();

  // Create audio track from RTCAudioSource
  const audioSource = new wrtc.nonstandard.RTCAudioSource();
  const audioTrack = audioSource.createTrack();
  const localTrack = new LocalAudioTrack(audioTrack);

  // Connect
  const room = new Room();

  let connected = false;
  let error = null;

  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    if (state === ConnectionState.Connected) connected = true;
  });

  room.on(RoomEvent.Disconnected, () => {
    if (!connected) error = error || new Error('Disconnected before connected');
  });

  await room.connect(LIVEKIT_URL, token);
  console.error(`[publisher] Connected to room ${ROOM} as ${IDENTITY}`);

  // Publish
  const pub = await room.localParticipant.publishTrack(localTrack);
  console.error(`[publisher] Published track: ${pub.trackSid}`);

  // Push PCM samples in 10ms chunks (480 samples at 48kHz — RTCAudioSource requires 10ms frames)
  const CHUNK_MS = 10;
  const chunkSamples = Math.floor(SAMPLE_RATE * CHUNK_MS / 1000);
  let sampleIdx = 0;
  const start = Date.now();
  let pushed = 0;

  const pushNext = () => {
    if (Date.now() - start > PUBLISH_DURATION_S * 1000) {
      console.error(`[publisher] Done: pushed ${pushed} chunks over ${PUBLISH_DURATION_S}s`);
      room.disconnect().catch(() => {});
      return;
    }

    // RTCAudioSource expects Int16Array when bitsPerSample=16
    const frameI16 = new Int16Array(chunkSamples);
    for (let i = 0; i < chunkSamples; i++) {
      const s = PCM_DATA[(sampleIdx + i) % PCM_DATA.length];
      frameI16[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
    }
    sampleIdx = (sampleIdx + chunkSamples) % PCM_DATA.length;

    audioSource.onData({
      samples: frameI16,
      sampleRate: SAMPLE_RATE,
      bitsPerSample: 16,
      channelCount: 1,
      numberOfFrames: chunkSamples,
    });
    pushed++;
    setTimeout(pushNext, CHUNK_MS);
  };

  pushNext();

  // Clean shutdown
  process.on('SIGINT', async () => {
    console.error('[publisher] Shutting down');
    await room.disconnect();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(`[publisher] FATAL: ${e.message}`);
  process.exit(1);
});
