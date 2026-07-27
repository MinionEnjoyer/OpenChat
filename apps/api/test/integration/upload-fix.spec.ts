/**
 * Upload fix — end-to-end integration test.
 *
 * Verifies POST /api/uploads succeeds against the running OpenShare
 * (chat-dev-openshare on :8800) via the surviving controller.
 *
 * The broken upstream controller (share/uploads.controller.ts) sent
 * Authorization: Bearer <SHARE_API_KEY> to OpenShare's /upload, which
 * uses cookie/session auth and returned 401. The surviving controller
 * (uploads/uploads.controller.ts) uses cookie-session via ensureSession()
 * and returns 200.
 */
import * as fs from 'fs';
import * as path from 'path';
import { apiFetch, createJar } from '../characterization/helpers';

const API_BASE = process.env.CHAR_API_BASE ?? 'http://localhost:3001/api';
const SHARE_BASE = process.env.CHAR_SHARE_BASE ?? 'http://localhost:8800';
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'red-1x1.png');

type BearerToken = string;

async function devLoginBearer(username: string) {
  const res = await apiFetch('/auth/dev-login', {
    method: 'POST',
    body: { username },
    jar: createJar(),
  });
  expect(res.status).toBe(201);
  return res.body as {
    id: string;
    accessToken: BearerToken;
    refreshToken: BearerToken;
    expiresIn: number;
  };
}

/**
 * Upload via native fetch (FormData + Blob) because apiFetch JSON-encodes
 * bodies which corrupts multipart data.
 */
async function uploadFixture(
  authToken: BearerToken,
  filePath: string,
  filename: string,
): Promise<any> {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'image/png' });
  const form = new FormData();
  form.append('files', blob, filename);

  const resp = await fetch(`${API_BASE}/uploads`, {
    method: 'POST',
    headers: { authorization: `Bearer ${authToken}` },
    body: form,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Upload failed: ${resp.status} ${text}`);
  }

  return resp.json();
}

describe('E2E upload against OpenShare', () => {
  let authToken: BearerToken;

  beforeAll(async () => {
    const session = await devLoginBearer('fix-upload-e2e');
    authToken = session.accessToken;
  });

  it('POST /api/uploads succeeds against OpenShare and returns valid attachment', async () => {
    const attachments = await uploadFixture(authToken, FIXTURE_PATH, 'red-1x1.png');

    expect(Array.isArray(attachments)).toBe(true);
    expect(attachments.length).toBe(1);

    const a = attachments[0];
    expect(typeof a.shareAssetId).toBe('string');
    expect(a.shareAssetId.length).toBeGreaterThan(0);
    expect(a.filename).toBe('red-1x1.png');
    expect(a.mimeType).toBe('image/png');
    expect(a.size).toBeTruthy();
    expect(typeof a.url).toBe('string');
    expect(a.url).toContain('/api/media/');
    expect(typeof a.thumbnailUrl).toBe('string');
    expect(a.thumbnailUrl).toContain('/api/media/');
  });

  it('uploaded asset is retrievable via OpenShare raw endpoint', async () => {
    const attachments = await uploadFixture(authToken, FIXTURE_PATH, 'red-1x1.png');
    const assetId = attachments[0].shareAssetId;

    // Fetch directly from OpenShare (public /raw/{id})
    const resp = await fetch(`${SHARE_BASE}/raw/${assetId}`);
    expect(resp.status).toBe(200);

    const body = Buffer.from(await resp.arrayBuffer());
    const fixture = fs.readFileSync(FIXTURE_PATH);
    expect(body.equals(fixture)).toBe(true);
  });

  it('OpenShare stores upload with chat source attribution', async () => {
    const uniqueName = `fix-upload-${Date.now()}.png`;
    const attachments = await uploadFixture(authToken, FIXTURE_PATH, uniqueName);
    const assetId = attachments[0].shareAssetId;

    const resp = await fetch(`${SHARE_BASE}/raw/${assetId}`);
    expect(resp.status).toBe(200);
  });
});
