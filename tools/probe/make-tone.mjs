#!/usr/bin/env node
/**
 * make-tone.mjs — generate a 440 Hz sine wave WAV file for audio verification.
 *
 * Usage: node tools/probe/make-tone.mjs [--out path] [--duration seconds] [--rate hz]
 *
 * Output: 16-bit PCM, mono WAV at the specified sample rate (default 48 kHz).
 * Suitable for `adb emu avd hostmicon injection` or host-side publishing.
 *
 * The script is the provenance for the binary fixture — commit this, not an
 * opaque blob.
 *
 * @infra FR-VOX-001 acceptance criterion: known injected signal for audio probe.
 */

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    out:      { type: 'string', default: 'tools/probe/tone440.wav' },
    duration: { type: 'string', default: '5' },
    rate:     { type: 'string', default: '48000' },
    freq:     { type: 'string', default: '440' },
  },
});

const DURATION = parseFloat(values.duration);
const SAMPLE_RATE = parseInt(values.rate, 10);
const FREQ = parseFloat(values.freq);
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION);

// Generate sine samples (range -1..1)
const samples = new Float32Array(NUM_SAMPLES);
for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  // Linear fade-in/out to avoid clicks (50ms each)
  let envelope = 1;
  const fadeSamples = Math.floor(0.05 * SAMPLE_RATE);
  if (i < fadeSamples) envelope = i / fadeSamples;
  else if (i > NUM_SAMPLES - fadeSamples) envelope = (NUM_SAMPLES - i) / fadeSamples;
  samples[i] = Math.sin(2 * Math.PI * FREQ * t) * 0.9 * envelope;
}

// Convert to 16-bit PCM
const pcm = new Int16Array(NUM_SAMPLES);
for (let i = 0; i < NUM_SAMPLES; i++) {
  const clamped = Math.max(-1, Math.min(1, samples[i]));
  pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
}

// Build WAV file
const dataSize = NUM_SAMPLES * BYTES_PER_SAMPLE;
const fileSize = 44 + dataSize; // canonical WAV header
const buffer = Buffer.alloc(fileSize);
let off = 0;

function w32(v) { buffer.writeUInt32LE(v, off); off += 4; }
function w16(v) { buffer.writeUInt16LE(v, off); off += 2; }
function wStr(s) { buffer.write(s, off, s.length, 'ascii'); off += s.length; }

// RIFF header
wStr('RIFF');
w32(fileSize - 8);
wStr('WAVE');

// fmt chunk
wStr('fmt ');
w32(16);             // chunk size
w16(1);              // PCM
w16(NUM_CHANNELS);
w32(SAMPLE_RATE);
w32(SAMPLE_RATE * NUM_CHANNELS * BYTES_PER_SAMPLE); // byte rate
w16(NUM_CHANNELS * BYTES_PER_SAMPLE);               // block align
w16(BITS_PER_SAMPLE);

// data chunk
wStr('data');
w32(dataSize);
buffer.set(new Uint8Array(pcm.buffer), off);

writeFileSync(values.out, buffer);
console.error(`Wrote ${values.out}: ${NUM_SAMPLES} samples, ${DURATION}s, ${SAMPLE_RATE} Hz, ${FREQ} Hz tone`);
