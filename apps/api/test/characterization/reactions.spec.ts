/** @characterizes reactions — add/remove, per E7 result is message.updated */
import { seed, apiFetch } from './helpers';
let s: Awaited<ReturnType<typeof seed>>;
beforeAll(async () => { s = await seed(); });

describe('reactions', () => {
  it('adds reaction (201 returns message with reactions)', async () => {
    const m = await apiFetch(`/channels/${s.textChannelId}/messages`, { method:'POST', body:{content:'React'}, jar:s.alice.jar });
    const res = await apiFetch(`/messages/${m.body.id}/reactions`, { method:'POST', body:{emoji:'👍'}, jar:s.alice.jar });
    // characterizes: reaction add returns 201 Created
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('reactions');
    expect(Array.isArray(res.body.reactions)).toBe(true);
    const r = res.body.reactions.find((x:any)=>x.emoji==='👍');
    expect(r).toBeDefined();
  });
  it('removes reaction (200)', async () => {
    const m = await apiFetch(`/channels/${s.textChannelId}/messages`, { method:'POST', body:{content:'Unreact'}, jar:s.alice.jar });
    await apiFetch(`/messages/${m.body.id}/reactions`, { method:'POST', body:{emoji:'👋'}, jar:s.alice.jar });
    const res = await apiFetch(`/messages/${m.body.id}/reactions/%F0%9F%91%8B`, { method:'DELETE', jar:s.alice.jar });
    // characterizes: reaction removal returns 200
    expect(res.status).toBe(200);
    const gone = res.body.reactions?.find((x:any)=>x.emoji==='👋');
    expect(gone).toBeUndefined();
  });
});