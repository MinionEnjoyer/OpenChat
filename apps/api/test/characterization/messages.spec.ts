/** @characterizes messages — list, send, edit, delete, read, pagination per E6 */
import { seed, apiFetch, assertMessageShape, assertIsoDate, assertAttachmentShape, assertReplyToShape } from './helpers';
let s: Awaited<ReturnType<typeof seed>>;
beforeAll(async () => { s = await seed(); });

describe('messages — list', () => {
  it('lists messages newest-first', async () => {
    const res = await apiFetch(`/channels/${s.textChannelId}/messages`, { jar: s.alice.jar });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // characterizes: newest-first (descending createdAt)
    for (let i = 1; i < Math.min(res.body.length, 5); i++) {
      expect(new Date(res.body[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(res.body[i].createdAt).getTime());
    }
  });
  it('message with attachment — exercises assertAttachmentShape', async () => {
    const res = await apiFetch(`/channels/${s.textChannelId}/messages?limit=20`, { jar: s.alice.jar });
    expect(res.status).toBe(200);
    // Find the message with attachments
    const attMsg = res.body.find((m: any) => m.id === s.attachmentMsgId);
    expect(attMsg).toBeDefined();
    assertMessageShape(attMsg);
    expect(attMsg.attachments.length).toBeGreaterThanOrEqual(1);
    assertAttachmentShape(attMsg.attachments[0]);
  });
  it('supports ?before cursor (E6: no gaps/dupes)', async () => {
    const first = await apiFetch(`/channels/${s.textChannelId}/messages?limit=1`, { jar: s.alice.jar });
    const beforeId = first.body[0].id;
    const page = await apiFetch(`/channels/${s.textChannelId}/messages?before=${beforeId}&limit=5`, { jar: s.alice.jar });
    expect(page.status).toBe(200);
    for (const msg of page.body) expect(msg.id).not.toBe(beforeId);
  });
  it('supports custom limit (characterizes: limit+1 for hasMore)', async () => {
    const res = await apiFetch(`/channels/${s.textChannelId}/messages?limit=3`, { jar: s.alice.jar });
    expect(res.status).toBe(200);
    // characterizes: service fetches limit+1 internally, may return limit+1 items
    expect(res.body.length).toBeLessThanOrEqual(4);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});

describe('messages — send', () => {
  it('creates a message (201)', async () => {
    const res = await apiFetch(`/channels/${s.textChannelId}/messages`, {
      method: 'POST', body: { content: 'Hello!' }, jar: s.alice.jar,
    });
    expect(res.status).toBe(201);
    assertMessageShape(res.body);
    expect(res.body.content).toBe('Hello!');
    expect(res.body.authorId).toBe(s.alice.userId);
    expect(res.body.pinned).toBe(false);
    expect(res.body.editedAt).toBeNull();
    expect(res.body.deletedAt).toBeNull();
  });
  it('accepts nonce', async () => {
    const nonce = 'nc-' + Date.now();
    const res = await apiFetch(`/channels/${s.textChannelId}/messages`, {
      method: 'POST', body: { content: 'x', nonce }, jar: s.alice.jar,
    });
    expect(res.status).toBe(201);
  });
  it('rejects empty content', async () => {
    const res = await apiFetch(`/channels/${s.textChannelId}/messages`, {
      method: 'POST', body: { content: '' }, jar: s.alice.jar,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('messages — edit', () => {
  it('edits content and sets editedAt', async () => {
    const m = await apiFetch(`/channels/${s.textChannelId}/messages`, {
      method: 'POST', body: { content: 'Original' }, jar: s.alice.jar,
    });
    const res = await apiFetch(`/messages/${m.body.id}`, {
      method: 'PATCH', body: { content: 'Edited' }, jar: s.alice.jar,
    });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Edited');
    expect(res.body.editedAt).not.toBeNull();
    assertIsoDate(res.body.editedAt);
  });
  it('rejects non-author edit', async () => {
    const m = await apiFetch(`/channels/${s.textChannelId}/messages`, {
      method: 'POST', body: { content: 'Mine' }, jar: s.alice.jar,
    });
    const res = await apiFetch(`/messages/${m.body.id}`, {
      method: 'PATCH', body: { content: 'Nope' }, jar: s.bob.jar,
    });
    expect([403, 401]).toContain(res.status);
  });
});

describe('messages — delete (soft)', () => {
  it('soft-deletes: sets deletedAt', async () => {
    const m = await apiFetch(`/channels/${s.textChannelId}/messages`, {
      method: 'POST', body: { content: 'Bye' }, jar: s.alice.jar,
    });
    const res = await apiFetch(`/messages/${m.body.id}`, { method: 'DELETE', jar: s.alice.jar });
    expect(res.status).toBe(200);
    expect(res.body.deletedAt).not.toBeNull();
  });
});

describe('messages — read', () => {
  it('marks channel as read', async () => {
    const m = await apiFetch(`/channels/${s.textChannelId}/messages`, {
      method: 'POST', body: { content: 'Mark test' }, jar: s.alice.jar,
    });
    const res = await apiFetch(`/channels/${s.textChannelId}/read`, {
      method: 'POST', body: { lastReadMessageId: m.body.id }, jar: s.alice.jar,
    });
    expect([200, 201, 204]).toContain(res.status);
  });
});