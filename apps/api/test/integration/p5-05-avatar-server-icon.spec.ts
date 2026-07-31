/**
 * P5-05 — Avatar upload (self) and server icon upload via broker, square crop.
 *
 * @satisfies FR-MED-020 — Avatar upload (self) and server icon upload via broker
 *
 * Pipeline: dev-login → upload fixture → PATCH /auth/me avatarUrl → verify GET /auth/me
 * Same for server icon: create server → PATCH /servers/:id iconUrl → verify GET /servers/:id
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

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function uploadFixture(token: string, filePath: string, filename: string) {
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

describe('P5-05 — avatar & server icon upload (FR-MED-020)', () => {
  let token: string;
  let userId: string;
  let avatarUpload: any;
  let serverId: string;

  beforeAll(async () => {
    const session = await devLoginBearer('med020-avatar-test');
    token = session.accessToken;
    userId = session.id;

    // Upload the fixture once — it'll be used for both avatar and server icon
    const result = await uploadFixture(token, FIXTURE_PATH, 'avatar-test.png');
    const attachments = result.attachments;
    expect(Array.isArray(attachments)).toBe(true);
    expect(attachments.length).toBe(1);
    avatarUpload = attachments[0];

    // Create a server so we can test server icon
    const serverRes = await apiFetch('/servers', {
      method: 'POST',
      headers: bearer(token),
      body: { name: 'med020-icon-test' },
    });
    expect(serverRes.status).toBe(201);
    serverId = (serverRes.body as { id: string }).id;
  });

  // ── FR-MED-020: Self avatar upload ─────────────────────────────────

  // @satisfies FR-MED-020
  it('PATCH /auth/me avatarUrl + verify via GET /auth/me', async () => {
    const thumbnailUrl = avatarUpload.thumbnailUrl;
    expect(typeof thumbnailUrl).toBe('string');
    expect(thumbnailUrl.length).toBeGreaterThan(0);

    // Set avatar
    const patchRes = await apiFetch('/auth/me', {
      method: 'PATCH',
      headers: bearer(token),
      body: { avatarUrl: thumbnailUrl },
    });
    expect(patchRes.status).toBe(200);

    // Verify by reading back — do NOT trust the 200
    const meRes = await apiFetch('/auth/me', {
      headers: bearer(token),
    });
    expect(meRes.status).toBe(200);
    expect((meRes.body as { avatarUrl: string | null }).avatarUrl).toBe(thumbnailUrl);

    // Clear avatar so next runs are clean
    await apiFetch('/auth/me', {
      method: 'PATCH',
      headers: bearer(token),
      body: { avatarUrl: '' },
    });
  });

  // @satisfies FR-MED-020
  it('PATCH /auth/me clears avatar with empty string', async () => {
    // Set avatar first
    await apiFetch('/auth/me', {
      method: 'PATCH',
      headers: bearer(token),
      body: { avatarUrl: avatarUpload.thumbnailUrl },
    });

    // Clear it — the controller gate is typeof === 'string', so empty string is required
    const clearRes = await apiFetch('/auth/me', {
      method: 'PATCH',
      headers: bearer(token),
      body: { avatarUrl: '' },
    });
    expect(clearRes.status).toBe(200);

    // Verify cleared — empty string becomes null via data.avatarUrl || null
    const meRes = await apiFetch('/auth/me', {
      headers: bearer(token),
    });
    expect((meRes.body as { avatarUrl: string | null }).avatarUrl).toBeNull();
  });

  // ── FR-MED-020: Server icon upload ────────────────────────────────

  // @satisfies FR-MED-020
  it('PATCH /servers/:id iconUrl + verify via GET /servers/:id', async () => {
    const thumbnailUrl = avatarUpload.thumbnailUrl;

    // Set server icon
    const patchRes = await apiFetch(`/servers/${serverId}`, {
      method: 'PATCH',
      headers: bearer(token),
      body: { iconUrl: thumbnailUrl },
    });
    expect(patchRes.status).toBe(200);

    // Verify by reading back — do NOT trust the 200
    const serverRes = await apiFetch(`/servers/${serverId}`, {
      headers: bearer(token),
    });
    expect(serverRes.status).toBe(200);
    expect((serverRes.body as { iconUrl: string | null }).iconUrl).toBe(thumbnailUrl);

    // Clear server icon so next runs are clean
    await apiFetch(`/servers/${serverId}`, {
      method: 'PATCH',
      headers: bearer(token),
      body: { iconUrl: '' },
    });
  });

  // @satisfies FR-MED-020
  it('PATCH /servers/:id clears icon with empty string', async () => {
    // Set icon first
    await apiFetch(`/servers/${serverId}`, {
      method: 'PATCH',
      headers: bearer(token),
      body: { iconUrl: avatarUpload.thumbnailUrl },
    });

    // Clear it — Zod schema is z.string(), null fails validation, use empty string
    const clearRes = await apiFetch(`/servers/${serverId}`, {
      method: 'PATCH',
      headers: bearer(token),
      body: { iconUrl: '' },
    });
    expect(clearRes.status).toBe(200);

    // Verify cleared — empty string becomes null via data.iconUrl || null
    const serverRes = await apiFetch(`/servers/${serverId}`, {
      headers: bearer(token),
    });
    expect((serverRes.body as { iconUrl: string | null }).iconUrl).toBeNull();
  });
});
