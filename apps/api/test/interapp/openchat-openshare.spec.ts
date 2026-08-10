/**
 * Blocking OpenChat/OpenShare boundary tests.
 *
 * These tests use both real HTTP applications, their real multipart parsers,
 * persistent stores, service authentication, media proxy, and audio processor.
 * No OpenShare session or dev-login is used for OpenChat-owned assets.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { apiFetch, createJar } from '../characterization/helpers';

const API_BASE = process.env.CHAR_API_BASE ?? 'http://localhost:3001/api';
const SHARE_BASE = process.env.CHAR_SHARE_BASE ?? 'http://localhost:8800';
const SHARE_API_KEY = process.env.SHARE_API_KEY ?? 'dev-share-key';
const EXPECT_MEDIA_PROCESSORS = process.env.INTERAPP_EXPECT_MEDIA_PROCESSORS === '1';
const PNG = readFileSync(join(__dirname, '..', 'fixtures', 'red-1x1.png'));

type Attachment = {
  id: string;
  shareAssetId: string;
  filename: string;
  mimeType: string;
  size: string;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function makeWaveFile(durationSeconds = 0.5): Buffer {
  const sampleRate = 8_000;
  const samples = Math.floor(sampleRate * durationSeconds);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 12_000);
    buffer.writeInt16LE(value, 44 + index * 2);
  }
  return buffer;
}

async function upload(
  token: string,
  files: Array<{ bytes: Buffer; name: string; type: string }>,
): Promise<{ attachments: Attachment[]; rejected: Array<{ name: string; reason: string }> }> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  }
  const response = await fetch(`${API_BASE}/uploads`, {
    method: 'POST',
    headers: bearer(token),
    body: form,
  });
  const text = await response.text();
  expect(response.status).toBe(201);
  return JSON.parse(text);
}

async function responseBytes(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

describe('OpenChat and OpenShare live boundary', () => {
  let token: string;
  let serverId: string;
  let channelId: string;
  let image: Attachment;
  let text: Attachment;
  let audio: Attachment;
  const wave = makeWaveFile();

  beforeAll(async () => {
    const login = await apiFetch('/auth/dev-login', {
      method: 'POST',
      body: { username: 'interapp-owner' },
      jar: createJar(),
    });
    expect(login.status).toBe(201);
    token = login.body.accessToken;

    const server = await apiFetch('/servers', {
      method: 'POST',
      headers: bearer(token),
      body: { name: 'Inter-app Contract' },
    });
    expect(server.status).toBe(201);
    serverId = server.body.id;

    const channels = await apiFetch(`/servers/${serverId}/channels`, { headers: bearer(token) });
    channelId = channels.body.find((channel: { type: string }) => channel.type === 'TEXT')?.id;
    expect(channelId).toBeTruthy();

    const imageAndText = await upload(token, [
      { bytes: PNG, name: 'interapp-sticker.png', type: 'image/png' },
      { bytes: Buffer.from('OpenChat and OpenShare contract\n'), name: 'interapp-note.txt', type: 'text/plain' },
    ]);
    expect(imageAndText.rejected).toEqual([]);
    [image, text] = imageAndText.attachments;

    const audioResult = await upload(token, [
      { bytes: wave, name: 'interapp-sound.wav', type: 'audio/wav' },
    ]);
    expect(audioResult.rejected).toEqual([]);
    [audio] = audioResult.attachments;
  });

  it('rejects missing and incorrect OpenShare service credentials', async () => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'unauthorized.png');
    const missing = await fetch(`${SHARE_BASE}/api/assets`, {
      method: 'POST',
      headers: { origin: SHARE_BASE },
      body: form,
    });
    expect(missing.status).toBe(401);

    const wrongForm = new FormData();
    wrongForm.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'unauthorized.png');
    const wrong = await fetch(`${SHARE_BASE}/api/assets`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-service-key',
        'x-share-user-sub': 'interapp-owner',
      },
      body: wrongForm,
    });
    expect(wrong.status).toBe(401);

    const correctForm = new FormData();
    correctForm.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'authorized.png');
    const correct = await fetch(`${SHARE_BASE}/api/assets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${SHARE_API_KEY}`,
        'x-share-user-sub': 'interapp-owner',
        'x-share-user-name': 'Inter-app Owner',
      },
      body: correctForm,
    });
    expect(correct.status).toBe(200);
    expect(await correct.json()).toEqual(expect.objectContaining({
      id: expect.any(String),
      filename: 'authorized.png',
      mimeType: 'image/png',
    }));
  });

  it('uploads multiple media classes with stable proxy-only attachment references', () => {
    for (const attachment of [image, text, audio]) {
      expect(attachment.id).toBe(attachment.shareAssetId);
      expect(attachment.url).toBe(`/api/media/${attachment.shareAssetId}/raw`);
      expect(attachment.thumbnailUrl).toBe(`/api/media/${attachment.shareAssetId}/thumb`);
      expect(attachment.size).toMatch(/^\d+$/);
      expect(attachment.url).not.toContain(SHARE_BASE);
    }
    expect(image.mimeType).toBe('image/png');
    expect(text.mimeType).toBe('text/plain');
    expect(audio.mimeType).toBe('audio/wav');
  });

  it('retrieves exact bytes through OpenShare and the authenticated OpenChat proxy', async () => {
    const direct = await fetch(`${SHARE_BASE}/raw/${image.shareAssetId}`);
    expect(direct.status).toBe(200);
    expect((await responseBytes(direct)).equals(PNG)).toBe(true);

    const proxied = await fetch(`${API_BASE}/media/${text.shareAssetId}/raw`, {
      headers: bearer(token),
    });
    expect(proxied.status).toBe(200);
    expect(await proxied.text()).toBe('OpenChat and OpenShare contract\n');

    const anonymous = await fetch(`${API_BASE}/media/${image.shareAssetId}/raw`);
    expect(anonymous.status).toBe(401);
  });

  it('preserves byte ranges and generated thumbnails through the OpenChat proxy', async () => {
    const range = await fetch(`${API_BASE}/media/${image.shareAssetId}/raw`, {
      headers: { ...bearer(token), range: 'bytes=0-7' },
    });
    expect(range.status).toBe(206);
    expect((await responseBytes(range)).equals(PNG.subarray(0, 8))).toBe(true);
    expect(range.headers.get('content-range')).toMatch(/^bytes 0-7\//);

    const thumbnail = await fetch(`${API_BASE}/media/${image.shareAssetId}/thumb`, {
      headers: bearer(token),
    });
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get('content-type')).toMatch(/^image\//);
    expect((await responseBytes(thumbnail)).length).toBeGreaterThan(0);
  });

  it('propagates a missing OpenShare asset as a useful authenticated 404', async () => {
    const response = await fetch(`${API_BASE}/media/missing-interapp-asset/raw`, {
      headers: bearer(token),
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.message).toContain('Share proxy failed (404)');
  });

  it('completes the sticker upload, registration, message, listing, and removal lifecycle', async () => {
    const created = await apiFetch(`/servers/${serverId}/stickers`, {
      method: 'POST',
      headers: bearer(token),
      body: { name: 'Inter-app sticker', url: image.url },
    });
    expect(created.status).toBe(201);
    expect(created.body.url).toBe(image.url);

    const message = await apiFetch(`/channels/${channelId}/messages`, {
      method: 'POST',
      headers: bearer(token),
      body: { content: `sticker::${image.url}` },
    });
    expect(message.status).toBe(201);
    expect(message.body.content).toBe(`sticker::${image.url}`);

    const listed = await apiFetch(`/servers/${serverId}/stickers`, { headers: bearer(token) });
    expect(listed.body).toContainEqual(expect.objectContaining({ id: created.body.id, url: image.url }));

    const removed = await apiFetch(`/servers/${serverId}/stickers/${created.body.id}`, {
      method: 'DELETE',
      headers: bearer(token),
    });
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ success: true });
  });

  it('analyzes and registers a soundboard asset before removing the registration', async () => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wave)], { type: 'audio/wav' }), 'waveform.wav');
    const analysis = await fetch(`${API_BASE}/uploads/waveform`, {
      method: 'POST',
      headers: bearer(token),
      body: form,
    });
    expect(analysis.status).toBe(201);
    const waveform = await analysis.json();
    if (EXPECT_MEDIA_PROCESSORS) {
      expect(waveform.duration).toBeGreaterThan(0.4);
      expect(waveform.duration).toBeLessThan(0.6);
      expect(waveform.peaks.length).toBeGreaterThan(10);
      expect(waveform.peaks.every((peak: number) => peak >= 0 && peak <= 100)).toBe(true);
    } else {
      expect(waveform.duration === null || typeof waveform.duration === 'number').toBe(true);
      expect(waveform.peaks === null || Array.isArray(waveform.peaks)).toBe(true);
    }

    const created = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      headers: bearer(token),
      body: { name: 'Inter-app sound', url: audio.url, emoji: null },
    });
    expect(created.status).toBe(201);
    expect(created.body.url).toBe(audio.url);

    const listed = await apiFetch(`/servers/${serverId}/sounds`, { headers: bearer(token) });
    expect(listed.body).toContainEqual(expect.objectContaining({ id: created.body.id, url: audio.url }));

    const removed = await apiFetch(`/servers/${serverId}/sounds/${created.body.id}`, {
      method: 'DELETE',
      headers: bearer(token),
    });
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ success: true });
  });
});
