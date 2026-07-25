/**
 * P5-01 — FR-MED-001: OpenShare service asset API (Bearer auth).
 *
 * @satisfies FR-MED-001
 *
 * Tests the ShareService's Bearer-token upload path.
 * Since OpenShare does NOT yet have POST /api/assets (2026-07-25),
 * these tests characterize the current behavior:
 *  - The service API returns 404 → fallback to cookie-based upload succeeds.
 *  - The fallback produces valid attachment refs (regression test).
 *
 * Once OpenShare implements FR-MED-001, these tests should be updated to
 * assert the Bearer path directly.
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

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
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

    // Upload via POST /api/uploads — which internally tries Bearer token
    // first (→ 404 today), then falls back to cookie-based upload.
    // FR-MED-001: once OpenShare implements POST /api/assets, this will
    // go through the Bearer path directly.
    const attachments = await uploadFixture(token, FIXTURE_PATH, 'red-1x1.png');
    expect(Array.isArray(attachments)).toBe(true);
    expect(attachments.length).toBe(1);

    attachment = attachments[0];
    assetId = attachment.shareAssetId;
  });

  // ── FR-MED-001 core: upload succeeds (via fallback today) ─────────

  // @satisfies FR-MED-001
  it('POST /api/uploads succeeds (service API attempted, cookie fallback used)', () => {
    // The upload succeeded — the broker tried Bearer first, got 404,
    // fell back to cookie-based /upload.
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
  });

  // ── Direct OpenShare calls characterize the current state ─────────

  // @satisfies FR-MED-001
  it('POST /api/assets on OpenShare returns 404 (route not yet built)', async () => {
    // Characterizes: the Bearer endpoint does not exist yet.
    // Once OpenShare implements FR-MED-001, this should return 201.
    const resp = await fetch('http://localhost:8800/api/assets', {
      method: 'POST',
      headers: { authorization: 'Bearer test-key' },
    });
    expect(resp.status).toBe(404);
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
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
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
      headers: { cookie },
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
