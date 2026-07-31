/** @characterizes pins-polls — pin/unpin, poll create/vote */
import { seed, apiFetch, assertPollShape, assertMessageShape } from './helpers';
let s: Awaited<ReturnType<typeof seed>>;
beforeAll(async () => { s = await seed(); });

describe('pins', () => {
  it('pins a message', async () => {
    const m = await apiFetch(`/channels/${s.textChannelId}/messages`, { method:'POST', body:{content:'Pin'}, jar:s.alice.jar });
    const res = await apiFetch(`/messages/${m.body.id}/pin`, { method:'PATCH', body:{pinned:true}, jar:s.alice.jar });
    expect(res.status).toBe(200);
    expect(res.body.pinned).toBe(true);
    assertMessageShape(res.body);
  });
  it('unpins a message', async () => {
    const res = await apiFetch(`/messages/${s.messageIds[0]}/pin`, { method:'PATCH', body:{pinned:false}, jar:s.alice.jar });
    expect(res.status).toBe(200);
    expect(res.body.pinned).toBe(false);
    assertMessageShape(res.body);
  });
  it('GET /channels/:id/pins lists pinned messages', async () => {
    const m = await apiFetch(`/channels/${s.textChannelId}/messages`, { method:'POST', body:{content:'PinList'}, jar:s.alice.jar });
    await apiFetch(`/messages/${m.body.id}/pin`, { method:'PATCH', body:{pinned:true}, jar:s.alice.jar });
    const res = await apiFetch(`/channels/${s.textChannelId}/pins`, { jar:s.alice.jar });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const msg of res.body) {
      assertMessageShape(msg);
    }
  });
});

describe('polls', () => {
  it('creates a poll message', async () => {
    const res = await apiFetch(`/channels/${s.textChannelId}/polls`, {
      method:'POST', body:{question:'Q?',options:['A','B']}, jar:s.alice.jar,
    });
    expect(res.status).toBe(201);
    assertMessageShape(res.body);
    expect(res.body.poll.question).toBe('Q?');
    expect(res.body.poll.options.length).toBe(2);
    assertPollShape(res.body.poll);
  });
  it('votes on a poll', async () => {
    const p = await apiFetch(`/channels/${s.textChannelId}/polls`, {
      method:'POST', body:{question:'Vote?',options:['Y','N']}, jar:s.alice.jar,
    });
    const res = await apiFetch(`/polls/options/${p.body.poll.options[0].id}/vote`, { method:'POST', jar:s.alice.jar });
    // characterizes: poll vote returns 200 or 201
    expect([200, 201]).toContain(res.status);
    if (res.status === 200 || res.status === 201) {
      assertMessageShape(res.body);
    }
  });
});
