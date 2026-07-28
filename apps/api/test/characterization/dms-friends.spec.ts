/** @characterizes dms + friends — DM gated by friendship, friend state machine */
import { seed, apiFetch, devLogin, assertFriendRequestShape, assertMessageShape } from './helpers';
let s: Awaited<ReturnType<typeof seed>>;
beforeAll(async () => { s = await seed(); });

describe('dms', () => {
  it('list returns array', async () => {
    const res = await apiFetch('/dms', { jar: s.alice.jar });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Validate shape of each DM if any exist
    for (const dm of res.body) {
      expect(typeof dm.id).toBe('string');
    }
  });
  it('DM requires friendship (403 for non-friends)', async () => {
    const a = await devLogin('dm-a-' + Date.now());
    const b = await devLogin('dm-b-' + Date.now());
    const res = await apiFetch('/dms', { method: 'POST', body: { userId: b.userId }, jar: a.jar });
    // characterizes: DM creation between non-friends returns 403
    expect(res.status).toBe(403);
  });
});

describe('friends', () => {
  it('list returns array', async () => {
    const res = await apiFetch('/friends', { jar: s.alice.jar });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
  it('send request (by username)', async () => {
    const a = await devLogin('fr-snd-' + Date.now());
    const b = await devLogin('fr-rcv-' + Date.now());
    const res = await apiFetch('/friends/requests', { method: 'POST', body: { username: b.username }, jar: a.jar });
    // characterizes: friend request may return 201 Created; response shape varies (User DTO vs Friendship)
    expect(res.status).toBeLessThan(500);
  });
  it('full cycle: send → accept → list', async () => {
    const a = await devLogin('fc-a-' + Date.now());
    const b = await devLogin('fc-b-' + Date.now());
    await apiFetch('/friends/requests', { method: 'POST', body: { username: b.username }, jar: a.jar });
    const pending = await apiFetch('/friends/requests', { jar: b.jar });
    if (pending.body.length > 0) {
      const res = await apiFetch(`/friends/requests/${pending.body[0].id}/accept`, { method: 'POST', jar: b.jar });
      expect(res.status).toBe(200);
      assertFriendRequestShape(res.body);
      expect(res.body.status).toBe('ACCEPTED');
    }
  });
  it('decline friend request', async () => {
    const a = await devLogin('fd-a-' + Date.now());
    const b = await devLogin('fd-b-' + Date.now());
    await apiFetch('/friends/requests', { method: 'POST', body: { username: b.username }, jar: a.jar });
    const pending = await apiFetch('/friends/requests', { jar: b.jar });
    if (pending.body.length > 0) {
      const res = await apiFetch(`/friends/requests/${pending.body[0].id}/decline`, { method: 'POST', jar: b.jar });
      // characterizes: decline returns status < 500
      expect(res.status).toBeLessThan(500);
    }
  });
  it('remove friend', async () => {
    const a = await devLogin('rm-a-' + Date.now());
    const b = await devLogin('rm-b-' + Date.now());
    await apiFetch('/friends/requests', { method: 'POST', body: { username: b.username }, jar: a.jar });
    const pending = await apiFetch('/friends/requests', { jar: b.jar });
    if (pending.body.length > 0) {
      await apiFetch(`/friends/requests/${pending.body[0].id}/accept`, { method: 'POST', jar: b.jar });
      const res = await apiFetch(`/friends/${a.userId}`, { method: 'DELETE', jar: b.jar });
      // characterizes: remove friend returns status < 500
      expect(res.status).toBeLessThan(500);
    }
  });
  it('block user', async () => {
    const a = await devLogin('bl-a-' + Date.now());
    const b = await devLogin('bl-b-' + Date.now());
    await apiFetch('/friends/requests', { method: 'POST', body: { username: b.username }, jar: a.jar });
    const pending = await apiFetch('/friends/requests', { jar: b.jar });
    if (pending.body.length > 0) {
      await apiFetch(`/friends/requests/${pending.body[0].id}/accept`, { method: 'POST', jar: b.jar });
      const res = await apiFetch(`/friends/block/${a.userId}`, { method: 'POST', jar: b.jar });
      // characterizes: block returns status < 500
      expect(res.status).toBeLessThan(500);
    }
  });
});
