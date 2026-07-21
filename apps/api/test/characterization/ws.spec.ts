/** @characterizes ws — handshake, 4401/4404, subscribe gating, ready payload servers:[] */
import { wsConnect, seed, apiFetch } from './helpers';
let s: Awaited<ReturnType<typeof seed>>;
beforeAll(async () => { s = await seed(); });

describe('ws — handshake', () => {
  it('connects and receives ready frame', async () => {
    const client = await wsConnect(s.alice.jar);
    try {
      const ready = client.frames.find(f => f.op === 'ready');
      expect(ready).toBeDefined();
      expect(ready!.d).toHaveProperty('user');
      expect(ready!.d.user).toHaveProperty('id', s.alice.userId);
      // characterizes: servers is hardcoded [] per gateway code
      expect(ready!.d).toHaveProperty('servers');
      expect(ready!.d.servers).toEqual([]);
    } finally { client.close(); }
  });

  it('invalid ticket → close 4401', async () => {
    const ws = new (require('ws'))('ws://localhost:3001/ws?ticket=bad');
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 5000);
      ws.on('close', (code: number) => {
        clearTimeout(t);
        expect(code).toBe(4401);
        resolve();
      });
      ws.on('error', () => {});
    });
  });
});

describe('ws — subscribe gating', () => {
  it('message.created only after subscribe', async () => {
    const client = await wsConnect(s.alice.jar);
    try {
      await apiFetch(`/channels/${s.textChannelId}/messages`, {
        method:'POST', body:{content:'Pre-sub'}, jar:s.alice.jar,
      });
      expect(client.frames.filter(f => f.op === 'message.created').length).toBe(0);

      client.send({ op:'subscribe', d:{channelId:s.textChannelId} });
      await new Promise(r => setTimeout(r, 300));
      const msg = await apiFetch(`/channels/${s.textChannelId}/messages`, {
        method:'POST', body:{content:'Post-sub'}, jar:s.alice.jar,
      });
      const ev = await client.waitFor(f => f.op === 'message.created' && f.d?.message?.id === msg.body.id, 10_000);
      expect(ev).toBeDefined();
    } finally { client.close(); }
  });

  it('unsubscribe stops delivery', async () => {
    const client = await wsConnect(s.alice.jar);
    try {
      client.send({ op:'subscribe', d:{channelId:s.textChannelId} });
      await new Promise(r => setTimeout(r, 300));
      client.send({ op:'unsubscribe', d:{channelId:s.textChannelId} });
      await new Promise(r => setTimeout(r, 300));
      await apiFetch(`/channels/${s.textChannelId}/messages`, {
        method:'POST', body:{content:'Post-unsub'}, jar:s.alice.jar,
      });
      await new Promise(r => setTimeout(r, 500));
      const recent = client.frames.filter(f => f.op === 'message.created');
      const match = recent.filter(f => f.d?.message?.content === 'Post-unsub');
      expect(match.length).toBe(0);
    } finally { client.close(); }
  });
});

describe('ws — message.send', () => {
  it('sends message via WS with nonce echo', async () => {
    const client = await wsConnect(s.alice.jar);
    try {
      client.send({ op:'subscribe', d:{channelId:s.textChannelId} });
      await new Promise(r => setTimeout(r, 300));
      const nonce = 'ws-nc-' + Date.now();
      client.send({ op:'message.send', d:{channelId:s.textChannelId, content:'WS msg', nonce} });
      const ev = await client.waitFor(f => f.op === 'message.created' && f.d?.message?.content === 'WS msg', 10_000);
      expect(ev).toBeDefined();
      expect(ev.d).toHaveProperty('nonce', nonce);
    } finally { client.close(); }
  });
});