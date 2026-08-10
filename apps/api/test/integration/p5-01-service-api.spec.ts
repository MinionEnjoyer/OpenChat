/**
 * P5-01 — FR-MED-001: OpenShare service asset API (Bearer auth).
 *
 * @satisfies FR-MED-001
 *
 * Tests the ShareService's Bearer-token upload path.
 * Current OpenShare implements POST /api/assets with scoped Bearer service
 * authentication. The blocking inter-app suite exercises its successful path;
 * this probationary suite retains direct auth and browser-upload regressions.
 */
import * as fs from 'fs';
import * as path from 'path';
import { apiFetch, createJar } from '../characterization/helpers';

const API_BASE = process.env.CHAR_API_BASE ?? 'http://localhost:3001/api';
const WEB_ORIGIN = process.env.CHAR_WEB_ORIGIN ?? 'http://localhost:3000';
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

/**
 * Upload files via native fetch (FormData + Blob).
 */
async function uploadFixture(
  token: string,
  filePath: string,
  filename: string,
): Promise<any> {
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

describe('P5-01 — FR-MED-001: ShareService with Bearer-token service API', () => {
  let token: string;
  let assetId: string;
  let attachment: any;

  beforeAll(async () => {
    const session = await devLoginBearer('p5-01-svc-api-test');
    token = session.accessToken;

    const result = await uploadFixture(token, FIXTURE_PATH, 'red-1x1.png');
    const attachments = result.attachments;
    expect(Array.isArray(attachments)).toBe(true);
    expect(attachments.length).toBe(1);

    attachment = attachments[0];
    assetId = attachment.shareAssetId;
  });

  // ── FR-MED-001 core: upload succeeds through the service contract ─

  // @satisfies FR-MED-001
  it('POST /api/uploads succeeds through the scoped service upload', () => {
    expect(typeof attachment.shareAssetId).toBe('string');
    expect(attachment.shareAssetId.length).toBeGreaterThan(0);
    expect(typeof attachment.filename).toBe('string');
    expect(attachment.filename).toBe('red-1x1.png');
    expect(typeof attachment.mimeType).toBe('string');
    expect(attachment.mimeType).toBe('image/png');
    expect(typeof attachment.size).toBe('string');
    expect(Number(attachment.size)).toBeGreaterThan(0);
    expect(typeof attachment.url).toBe('string');
    expect(attachment.url).toBe(`/api/media/${assetId}/raw`);
    expect(attachment.thumbnailUrl).toBe(`/api/media/${assetId}/thumb`);
  });

  // ── Direct OpenShare calls characterize the current state ─────────

  // @satisfies FR-MED-001
  it('POST /api/assets on OpenShare rejects an invalid service key', async () => {
    const resp = await fetch('http://localhost:8800/api/assets', {
      method: 'POST',
      headers: { authorization: 'Bearer test-key' },
    });
    expect(resp.status).toBe(401);
  });

  // @satisfies FR-MED-001
  it('GET /api/assets/:id on OpenShare returns 404 (route not yet built)', async () => {
    const resp = await fetch('http://localhost:8800/api/assets/test123', {
      headers: { accept: 'application/json' },
    });
    expect(resp.status).toBe(404);
  });

  // ── Regression: cookie-based upload still works ───────────────────

  // @satisfies FR-MED-001
  it('cookie-based POST /upload still works (regression)', async () => {
    // The cookie-based upload path must stay green — this is the
    // web client's direct upload path.
    const devLoginResp = await fetch('http://localhost:8800/auth/dev-login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: WEB_ORIGIN,
      },
      body: new URLSearchParams({ username: 'test-user' }).toString(),
    });
    expect(devLoginResp.status).toBe(200);

    const setCookie = devLoginResp.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();

    const cookie = setCookie!.split(';')[0];

    const fileBuffer = fs.readFileSync(FIXTURE_PATH);
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'image/png' });
    const form = new FormData();
    form.append('files', blob, 'regression-test.png');
    form.append('source', 'chat');

    const uploadResp = await fetch('http://localhost:8800/upload', {
      method: 'POST',
      headers: { cookie, origin: WEB_ORIGIN },
      body: form,
    });
    expect(uploadResp.status).toBe(200);

    const body = await uploadResp.json();
    expect(body.saved).toBeDefined();
    expect(body.saved.length).toBeGreaterThan(0);
    // @satisfies FR-MED-001
    expect(typeof body.saved[0].id).toBe('string');
    expect(body.saved[0].media_type).toBe('image');

    // Verify the uploaded asset is reachable via public /raw endpoint
    const assetId = body.saved[0].id;
    const rawResp = await fetch(`http://localhost:8800/raw/${assetId}`);
    expect(rawResp.status).toBe(200);

    const rawBuffer = Buffer.from(await rawResp.arrayBuffer());
    expect(rawBuffer.equals(fileBuffer)).toBe(true);
  });
});
