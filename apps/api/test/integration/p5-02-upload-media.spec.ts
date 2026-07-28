/**
 * P5-02 — Upload broker + authenticated media proxy (FR-MED-002, FR-MED-003).
 *
 * @satisfies FR-MED-002 — Authenticated upload broker
 * @satisfies FR-MED-003 — Authenticated media proxy
 *
 * ## Web Attachment shape (derived from apps/web/src/lib/share.ts)
 *
 * The web client's uploadToShare returns Attachment[] with:
 *   id: string          — shareAssetId
 *   shareAssetId: string
 *   filename: string
 *   mimeType: string
 *   size: string        — String(file.size) — NOTE: broker returns number
 *   url: string         — `${shareBaseUrl}/raw/${id}`
 *   thumbnailUrl: string | null — `${shareBaseUrl}/thumb/${id}`
 *   width: number | null
 *   height: number | null
 *   durationMs: number | null
 *
 * The broker (POST /api/uploads) returns UploadedAttachment[] matching this
 * shape but using /api/media/... proxy URLs and size as number.
 */
import * as fs from 'fs';
import * as path from 'path';
import { apiFetch, createJar } from '../characterization/helpers';

const API_BASE = process.env.CHAR_API_BASE ?? 'http://localhost:3001/api';
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'red-1x1.png');

async function devLoginBearer(username: string) {
  const res = await apiFetch('/auth/dev-login', {
    method: 'POST',
    body: { username },
    jar: createJar(),
  });
  expect(res.status).toBe(201);
  return res.body as {
    id: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

/**
 * Upload files via native fetch (FormData + Blob).
 * The characterisation helpers' apiFetch JSON-stringifies the body,
 * which corrupts binary multipart data, so we bypass it here.
 */
async function uploadFixture(token: string, filePath: string, filename: string): Promise<any[]> {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'image/png' });
  const form = new FormData();
  form.append('files', blob, filename);

  const resp = await fetch(`${API_BASE}/uploads`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });

  return resp.json();
}

describe('P5-02 — upload broker + media proxy', () => {
  let token: string;
  let assetId: string;
  let attachment: any;

  beforeAll(async () => {
    const session = await devLoginBearer('p5-upload-test');
    token = session.accessToken;

    // Upload the fixture
    const attachments = await uploadFixture(token, FIXTURE_PATH, 'red-1x1.png');
    expect(Array.isArray(attachments)).toBe(true);
    expect(attachments.length).toBe(1);

    attachment = attachments[0];
    assetId = attachment.shareAssetId;
  });

  // ── FR-MED-002: Upload broker ─────────────────────────────────────

  // @satisfies FR-MED-002
  it('returns web-compatible attachment refs from POST /api/uploads', () => {
    // Keys from web Attachment shape (apps/web/src/lib/types.ts)
    // Web: id, shareAssetId, filename, mimeType, size, url, thumbnailUrl, width, height, durationMs
    // Broker: shareAssetId (no id), filename, mimeType, size (number), url, thumbnailUrl, width, height, durationMs
    expect(typeof attachment.shareAssetId).toBe('string');
    expect(attachment.shareAssetId.length).toBeGreaterThan(0);
    expect(typeof attachment.filename).toBe('string');
    expect(attachment.filename).toBe('red-1x1.png');
    expect(typeof attachment.mimeType).toBe('string');
    expect(attachment.mimeType).toBe('image/png');
    expect(typeof attachment.size).toBe('number');
    expect(attachment.size).toBeGreaterThan(0);
    expect(typeof attachment.url).toBe('string');
    expect(attachment.url).toBe(`/api/media/${assetId}/raw`);
    expect(attachment.thumbnailUrl).toBe(`/api/media/${assetId}/thumb`);
    expect(attachment.width).toBeNull();
    expect(attachment.height).toBeNull();
    expect(attachment.durationMs).toBeNull();

    // Verify exact key set — no extra or missing keys
    const expectedKeys = [
      'shareAssetId',
      'filename',
      'mimeType',
      'size',
      'url',
      'thumbnailUrl',
      'width',
      'height',
      'durationMs',
    ].sort();
    const actualKeys = Object.keys(attachment).sort();
    expect(actualKeys).toEqual(expectedKeys);
  });

  // ── FR-MED-003: Media proxy ───────────────────────────────────────

  // @satisfies FR-MED-003
  it('GET /api/media/:assetId/raw returns the uploaded bytes with a bearer', async () => {
    const res = await apiFetch(`/media/${assetId}/raw`, {
      headers: bearer(token),
      rawResponse: true,
    });

    expect(res.status).toBe(200);

    // Read the raw body as buffer from the IncomingMessage
    const chunks: Buffer[] = [];
    const stream: NodeJS.ReadableStream = res.body;
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const body = Buffer.concat(chunks);

    const fixture = fs.readFileSync(FIXTURE_PATH);
    expect(body.equals(fixture)).toBe(true);
  });

  // @satisfies FR-MED-003
  it('Range request returns 206 with correct partial bytes', async () => {
    const res = await apiFetch(`/media/${assetId}/raw`, {
      headers: {
        ...bearer(token),
        range: 'bytes=0-9',
      },
      rawResponse: true,
    });

    expect(res.status).toBe(206);

    const chunks: Buffer[] = [];
    const stream: NodeJS.ReadableStream = res.body;
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const body = Buffer.concat(chunks);

    // First 10 bytes of a PNG file
    const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(body.equals(expected)).toBe(true);
    expect(body.length).toBe(10);
  });

  // @satisfies FR-MED-003
  it('unauthenticated GET /api/media/:assetId/raw returns 401', async () => {
    const res = await apiFetch(`/media/${assetId}/raw`);
    expect(res.status).toBe(401);
  });
});
