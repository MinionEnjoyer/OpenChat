/**
 * P5-01 — FR-MED-001: OpenShare service asset API (Bearer auth).
 *
 * @satisfies FR-MED-001
 *
 * Tests the ShareService's Bearer-token upload path.
 * Current OpenShare implements POST /api/assets with scoped Bearer service
 * authentication. The blocking inter-app suite exercises its successful path;
 * this probationary suite retains direct service-auth regressions.
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

});
