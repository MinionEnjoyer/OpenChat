/**
 * Soundboard integration tests — FR-SOUND-001 through FR-SOUND-006.
 *
 * Tests CRUD for /servers/:id/sounds endpoints against the live dev stack.
 * Covers: list, add, update, delete, validation failures, permission failures.
 *
 * @untraced FR-SOUND-001, FR-SOUND-002, FR-SOUND-003, FR-SOUND-004, FR-SOUND-005, FR-SOUND-006
 */
import { apiFetch, createJar, assertExactKeys, assertUuid } from '../characterization/helpers';

async function devLogin(username: string) {
  const jar = createJar();
  const res = await apiFetch('/auth/dev-login', { method: 'POST', body: { username }, jar });
  if (res.status !== 201 && res.status !== 200) throw new Error(`dev-login failed: ${res.status}`);
  return { username, userId: res.body.id, jar };
}

const SOUND_KEYS = ['id', 'name', 'url', 'emoji'];

function assertSoundShape(snd: any): void {
  assertExactKeys(snd, SOUND_KEYS, 'Sound');
  assertUuid(snd.id);
  expect(typeof snd.name).toBe('string');
  expect(typeof snd.url).toBe('string');
  if (snd.emoji !== null) expect(typeof snd.emoji).toBe('string');
}

describe('servers — sounds (integration)', () => {
  let serverId: string;
  let owner: Awaited<ReturnType<typeof devLogin>>;
  let member: Awaited<ReturnType<typeof devLogin>>;
  let outsider: Awaited<ReturnType<typeof devLogin>>;

  beforeAll(async () => {
    owner = await devLogin('sound-owner-' + Date.now());
    const srv = await apiFetch('/servers', {
      method: 'POST',
      body: { name: 'Sound Test Server' },
      jar: owner.jar,
    });
    expect(srv.status).toBe(201);
    serverId = srv.body.id;

    member = await devLogin('sound-member-' + Date.now());
    // owner invites member
    const inv = await apiFetch(`/servers/${serverId}/invites`, {
      method: 'POST',
      body: {},
      jar: owner.jar,
    });
    expect(inv.status).toBe(201);
    const accept = await apiFetch(`/invites/${inv.body.code}/accept`, {
      method: 'POST',
      jar: member.jar,
    });
    expect(accept.status).toBe(201);

    outsider = await devLogin('sound-outsider-' + Date.now());
  });

  /** @untraced FR-SOUND-001 */
  it('list sounds returns empty array for new server', async () => {
    const res = await apiFetch(`/servers/${serverId}/sounds`, { jar: owner.jar });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  /** @untraced FR-SOUND-002 */
  it('add sound returns 201 with correct shape', async () => {
    const res = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: 'Airhorn', url: 'https://example.com/airhorn.mp3' },
      jar: owner.jar,
    });
    expect(res.status).toBe(201);
    assertSoundShape(res.body);
    expect(res.body.name).toBe('Airhorn');
    expect(res.body.url).toBe('https://example.com/airhorn.mp3');
    expect(res.body.emoji).toBeNull();
  });

  /** @untraced FR-SOUND-002 */
  it('add sound with emoji stores emoji', async () => {
    const res = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: 'Clap', url: 'https://example.com/clap.mp3', emoji: '👏' },
      jar: owner.jar,
    });
    expect(res.status).toBe(201);
    assertSoundShape(res.body);
    expect(res.body.emoji).toBe('👏');
  });

  /** @untraced FR-SOUND-001 */
  it('list sounds returns added sounds', async () => {
    const res = await apiFetch(`/servers/${serverId}/sounds`, { jar: owner.jar });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    for (const s of res.body) assertSoundShape(s);
  });

  /** @untraced FR-SOUND-003 */
  it('update sound name', async () => {
    // First add a sound
    const add = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: 'Rename Me', url: 'https://example.com/rename.mp3' },
      jar: owner.jar,
    });
    expect(add.status).toBe(201);
    const soundId = add.body.id;

    const patch = await apiFetch(`/servers/${serverId}/sounds/${soundId}`, {
      method: 'PATCH',
      body: { name: 'Renamed' },
      jar: owner.jar,
    });
    expect(patch.status).toBe(200);
    assertSoundShape(patch.body);
    expect(patch.body.name).toBe('Renamed');
    expect(patch.body.id).toBe(soundId);
  });

  /** @untraced FR-SOUND-003 */
  it('update sound emoji', async () => {
    const add = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: 'Emoji Test', url: 'https://example.com/emoji.mp3', emoji: '😀' },
      jar: owner.jar,
    });
    expect(add.status).toBe(201);
    const soundId = add.body.id;

    // Change emoji
    const patch = await apiFetch(`/servers/${serverId}/sounds/${soundId}`, {
      method: 'PATCH',
      body: { emoji: '🎉' },
      jar: owner.jar,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.emoji).toBe('🎉');

    // Clear emoji (set to null)
    const patch2 = await apiFetch(`/servers/${serverId}/sounds/${soundId}`, {
      method: 'PATCH',
      body: { emoji: null },
      jar: owner.jar,
    });
    expect(patch2.status).toBe(200);
    expect(patch2.body.emoji).toBeNull();
  });

  /** @untraced FR-SOUND-004 */
  it('delete sound returns 200', async () => {
    const add = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: 'Delete Me', url: 'https://example.com/del.mp3' },
      jar: owner.jar,
    });
    expect(add.status).toBe(201);
    const soundId = add.body.id;

    const del = await apiFetch(`/servers/${serverId}/sounds/${soundId}`, {
      method: 'DELETE',
      jar: owner.jar,
    });
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });

    // Verify it's gone
    const list = await apiFetch(`/servers/${serverId}/sounds`, { jar: owner.jar });
    const ids = (list.body as { id: string }[]).map((s) => s.id);
    expect(ids).not.toContain(soundId);
  });

  /** @untraced FR-SOUND-005 */
  it('non-member cannot list sounds (404)', async () => {
    const res = await apiFetch(`/servers/${serverId}/sounds`, { jar: outsider.jar });
    // listSounds uses get() which throws NotFoundException (404) for non-members
    expect(res.status).toBe(404);
  });

  /** @untraced FR-SOUND-005 */
  it('non-member cannot add sounds (403)', async () => {
    const res = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: 'Hax', url: 'https://example.com/hax.mp3' },
      jar: outsider.jar,
    });
    expect(res.status).toBe(403);
  });

  /** @untraced FR-SOUND-005 */
  it('non-member cannot update sounds (403)', async () => {
    // First add a sound as owner
    const add = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: 'Protected', url: 'https://example.com/prot.mp3' },
      jar: owner.jar,
    });
    expect(add.status).toBe(201);

    const res = await apiFetch(`/servers/${serverId}/sounds/${add.body.id}`, {
      method: 'PATCH',
      body: { name: 'Hacked' },
      jar: outsider.jar,
    });
    expect(res.status).toBe(403);
  });

  /** @untraced FR-SOUND-005 */
  it('non-member cannot delete sounds (403)', async () => {
    const add = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: 'Delete Protect', url: 'https://example.com/dp.mp3' },
      jar: owner.jar,
    });
    expect(add.status).toBe(201);

    const res = await apiFetch(`/servers/${serverId}/sounds/${add.body.id}`, {
      method: 'DELETE',
      jar: outsider.jar,
    });
    expect(res.status).toBe(403);
  });

  /** @untraced FR-SOUND-006 */
  it('member without MANAGE_CHANNELS cannot add sounds (403)', async () => {
    const res = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: 'Member Add', url: 'https://example.com/member.mp3' },
      jar: member.jar,
    });
    expect(res.status).toBe(403);
  });

  /** @untraced FR-SOUND-002 */
  it('validation rejects missing name', async () => {
    const res = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { url: 'https://example.com/noname.mp3' },
      jar: owner.jar,
    });
    expect(res.status).toBe(400);
  });

  /** @untraced FR-SOUND-002 */
  it('validation rejects non-URL', async () => {
    const res = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: 'Bad URL', url: 'not-a-url' },
      jar: owner.jar,
    });
    expect(res.status).toBe(400);
  });

  /** @untraced FR-SOUND-002 */
  it('validation rejects empty name', async () => {
    const res = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: '', url: 'https://example.com/empty.mp3' },
      jar: owner.jar,
    });
    expect(res.status).toBe(400);
  });

  /** @untraced FR-SOUND-002 */
  it('validation rejects emoji > 8 chars', async () => {
    const res = await apiFetch(`/servers/${serverId}/sounds`, {
      method: 'POST',
      body: { name: 'Too Long Emoji', url: 'https://example.com/long.mp3', emoji: '123456789' },
      jar: owner.jar,
    });
    expect(res.status).toBe(400);
  });
});
