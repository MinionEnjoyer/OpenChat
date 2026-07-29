#!/usr/bin/env node
/**
 * P0-03 WS Probe — Experiments E2, E3, E7
 * Uses Node.js 24 native WebSocket (onopen/onmessage/onclose/onerror).
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '../../docs/capabilities/experiment-outputs');
const BASE = 'http://localhost:3001';

async function http(method, path, cookieJar, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (cookieJar) opts.headers.Cookie = cookieJar;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, headers: Object.fromEntries(res.headers) };
}

async function devLogin(username) {
  const { data, headers } = await http('POST', '/api/auth/dev-login', null, { username });
  const setCookie = headers['set-cookie'] || '';
  const sessionPart = (setCookie.match(/chat\.sid=[^;]+/)?.[0]) || setCookie.split(';')[0];
  return { user: data, cookie: sessionPart };
}

async function getWsTicket(cookie) {
  const { data } = await http('GET', '/api/auth/ws-ticket', cookie);
  return data?.ticket;
}

function connectWS(ticket) {
  return new Promise((resolve, reject) => {
    const wsUrl = `ws://localhost:3001/ws?ticket=${ticket}`;
    const frames = [];
    let resolved = false;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ op: 'ping', d: {} }));
    };

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data.toString());
        frames.push({ ts: Date.now(), ...frame });
      } catch (e) {
        frames.push({ ts: Date.now(), raw: event.data.toString() });
      }
    };

    ws.onerror = (err) => {
      if (!resolved) { resolved = true; reject(new Error(`ws error: ${err?.message || err}`)); }
    };

    ws.onclose = (ev) => {
      if (!resolved) { resolved = true; reject(new Error(`ws closed with code ${ev.code}`)); }
    };

    // Wait for 'ready' event
    const checkReady = setInterval(() => {
      const readyFrame = frames.find(f => f.op === 'ready');
      if (readyFrame) {
        clearInterval(checkReady);
        if (!resolved) {
          resolved = true;
          resolve({ ws, frames, getSnapshot: () => [...frames] });
        }
      }
    }, 50);

    setTimeout(() => {
      clearInterval(checkReady);
      if (!resolved) {
        resolved = true;
        resolve({ ws, frames, getSnapshot: () => [...frames], readyError: 'timeout waiting for ready' });
      }
    }, 5000);
  });
}

async function createServerAndChannel(cookie, name) {
  const { data: server } = await http('POST', '/api/servers', cookie, { name });
  const { data: channels } = await http('GET', `/api/servers/${server.id}/channels`, cookie);
  return { serverId: server.id, channelId: channels[0].id };
}

async function postMessage(cookie, channelId, content, nonce) {
  return await http('POST', `/api/channels/${channelId}/messages`, cookie, { content, nonce });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════ E2: WS handshake + ready payload + subscribe semantics ═══════════
async function runE2() {
  console.log('=== E2 ===');
  const alice = await devLogin('alice');
  const ticket = await getWsTicket(alice.cookie);
  console.log('  ticket obtained, connecting WS...');
  const { ws, getSnapshot } = await connectWS(ticket);

  const { channelId } = await createServerAndChannel(alice.cookie, 'E2 Server');
  ws.send(JSON.stringify({ op: 'subscribe', d: { channelId } }));
  await sleep(300);

  // Alice posts a message via REST — it should appear on the WS she's connected to
  const resp = await postMessage(alice.cookie, channelId, 'E2: hello from REST', 'e2-1');
  console.log(`  REST POST status: ${resp.status}, id: ${resp.data?.id || 'N/A'}`);
  await sleep(1000);

  const frames = getSnapshot();
  const ops = [...new Set(frames.map(f => f.op))];
  const msgEvents = frames.filter(f => f.op === 'message.created');
  ws.close();

  const result = {
    experiment: 'E2',
    hypothesis: 'WS handshake → ready(op=ready, d.user, d.servers:[]); subscribe gates MESSAGE_CREATED by channelId',
    observed: {
      readyFrame: frames.find(f => f.op === 'ready'),
      totalFrames: frames.length,
      observedOps: ops,
      messageCreatedCount: msgEvents.length,
      messageCreatedEvent: msgEvents[0] ? {
        hasNonce: !!msgEvents[0].d?.nonce,
        nonce: msgEvents[0].d?.nonce,
        hasMessage: !!msgEvents[0].d?.message,
        messageKeys: msgEvents[0].d?.message ? Object.keys(msgEvents[0].d.message) : null,
      } : null,
    },
    verdict: ops.includes('message.created') ? 'CONFIRMED — WS events propagate' : 'PARTIAL — check if events arrived',
  };
  await writeFile(`${OUT_DIR}/E2.json`, JSON.stringify(result, null, 2));
  console.log(`  Verdict: ${result.verdict}  Ops: [${ops.join(', ')}]`);
}

// ═══════════ E3: REST mutation → bus event matrix ═══════════
async function runE3() {
  console.log('=== E3 ===');
  const alice = await devLogin('alice');
  const ticket = await getWsTicket(alice.cookie);
  const { channelId } = await createServerAndChannel(alice.cookie, 'E3 Server');

  const { ws, getSnapshot } = await connectWS(ticket);
  ws.send(JSON.stringify({ op: 'subscribe', d: { channelId } }));
  await sleep(300);

  const matrix = [];

  // Helper: do rest op, collect new frames
  async function observe(label, fn) {
    const before = getSnapshot().length;
    await fn();
    await sleep(500);
    const after = getSnapshot();
    const newFrames = after.slice(before);
    const ops = [...new Set(newFrames.filter(f => f.op !== 'pong').map(f => f.op))];
    matrix.push({ mutation: label, wsOps: ops.length ? ops : ['(none)'] });
    return newFrames[0];
  }

  // 1. Create message
  const msgFrame = await observe('POST channels/:id/messages (create)', () =>
    postMessage(alice.cookie, channelId, 'E3 test msg', 'e3-1')
  );
  const msgId = msgFrame?.d?.message?.id;

  // 2. Edit message
  await observe('PATCH /api/messages/:id (edit)', () =>
    http('PATCH', `/api/messages/${msgId}`, alice.cookie, { content: 'E3: edited' })
  );

  // 3. Add reaction
  await observe('POST /api/messages/:id/reactions', () =>
    http('POST', `/api/messages/${msgId}/reactions`, alice.cookie, { emoji: '👍' })
  );

  // 4. Remove reaction
  await observe('DELETE /api/messages/:id/reactions/:emoji', () =>
    http('DELETE', `/api/messages/${msgId}/reactions/%F0%9F%91%8D`, alice.cookie)
  );

  // 5. Pin
  await observe('PATCH /api/messages/:id/pin', () =>
    http('PATCH', `/api/messages/${msgId}/pin`, alice.cookie, { pinned: true })
  );

  // 6. Create poll
  await observe('POST /api/channels/:id/polls', () =>
    http('POST', `/api/channels/${channelId}/polls`, alice.cookie, {
      question: 'E3 poll?', options: ['A', 'B'],
    })
  );

  // 7. Delete (post a new one then delete)
  const delResp = await postMessage(alice.cookie, channelId, 'to delete', 'e3-del');
  await sleep(300);
  await observe('DELETE /api/messages/:id', () =>
    http('DELETE', `/api/messages/${delResp.data.id}`, alice.cookie)
  );

  // 8. Mark read
  await observe('POST /api/channels/:id/read', () =>
    http('POST', `/api/channels/${channelId}/read`, alice.cookie, {
      lastReadMessageId: msgId,
    })
  );

  // 9. Server create (no channel sub needed — should it emit NOTIFY?)
  let before = getSnapshot().length;
  await http('POST', '/api/servers', alice.cookie, { name: 'E3 Extra' });
  await sleep(500);
  let newFrames = getSnapshot().slice(before);
  matrix.push({
    mutation: 'POST /api/servers (create)',
    wsOps: [...new Set(newFrames.filter(f => f.op !== 'pong').map(f => f.op))] || ['(none)'],
    note: 'Expected: no granular event per spec G4',
  });

  // 10. Channel create
  before = getSnapshot().length;
  await http('POST', `/api/servers/${channelId}/channels`, alice.cookie, { // wrong — need serverId
  });
  // Fix: use the actual server
  const { data: srv } = await http('GET', '/api/servers', alice.cookie);
  const e3Server = srv?.find(s => s.name === 'E3 Server');
  if (e3Server) {
    before = getSnapshot().length;
    await http('POST', `/api/servers/${e3Server.id}/channels`, alice.cookie, {
      name: 'e3-extra', type: 'TEXT',
    });
    await sleep(500);
    newFrames = getSnapshot().slice(before);
    matrix.push({
      mutation: 'POST /api/servers/:id/channels',
      wsOps: [...new Set(newFrames.filter(f => f.op !== 'pong').map(f => f.op))] || ['(none)'],
      note: 'Expected: no granular event',
    });
  }

  ws.close();

  const result = {
    experiment: 'E3',
    hypothesis: 'Only messages/typing/presence/watchparty/notify/mention/call.ring emit bus events; CRUD emits at most NOTIFY',
    matrix,
    verdict: 'RECORDED',
  };
  await writeFile(`${OUT_DIR}/E3.json`, JSON.stringify(result, null, 2));
  console.log('  Matrix recorded');
}

// ═══════════ E7: Reaction/pin/poll/read events on the wire ═══════════
async function runE7() {
  console.log('=== E7 ===');
  const alice = await devLogin('alice');
  const ticket = await getWsTicket(alice.cookie);
  const { channelId } = await createServerAndChannel(alice.cookie, 'E7 Server');

  const { ws, getSnapshot } = await connectWS(ticket);
  ws.send(JSON.stringify({ op: 'subscribe', d: { channelId } }));
  await sleep(300);

  // Post a message
  const msgResp = await postMessage(alice.cookie, channelId, 'E7 test message', 'e7-1');
  await sleep(500);
  const msgId = msgResp.data.id;

  const observations = [];

  let before, newFrames;

  // 1. Add reaction
  before = getSnapshot().length;
  await http('POST', `/api/messages/${msgId}/reactions`, alice.cookie, { emoji: '🔥' });
  await sleep(600);
  newFrames = getSnapshot().slice(before);
  const rEvent = newFrames.find(f => f.op !== 'pong');
  observations.push({
    action: 'Add reaction (🔥)',
    newOps: newFrames.filter(f => f.op !== 'pong').map(f => f.op),
    eventOp: rEvent?.op,
    hasFullMessage: rEvent ? (!!rEvent.d?.message) : null,
    reactionsCount: rEvent?.d?.message?.reactions?.length,
    reactionDetail: rEvent?.d?.message?.reactions?.[0],
  });

  // 2. Remove reaction
  before = getSnapshot().length;
  await http('DELETE', `/api/messages/${msgId}/reactions/%F0%9F%94%A5`, alice.cookie);
  await sleep(600);
  newFrames = getSnapshot().slice(before);
  const dEvent = newFrames.find(f => f.op !== 'pong');
  observations.push({
    action: 'Remove reaction (🔥)',
    newOps: newFrames.filter(f => f.op !== 'pong').map(f => f.op),
    eventOp: dEvent?.op,
  });

  // 3. Pin message
  before = getSnapshot().length;
  await http('PATCH', `/api/messages/${msgId}/pin`, alice.cookie, { pinned: true });
  await sleep(600);
  newFrames = getSnapshot().slice(before);
  const pEvent = newFrames.find(f => f.op !== 'pong');
  observations.push({
    action: 'Pin message (pinned=true)',
    newOps: newFrames.filter(f => f.op !== 'pong').map(f => f.op),
    eventOp: pEvent?.op,
    isPinned: pEvent?.d?.message?.pinned,
  });

  // 4. Unpin
  before = getSnapshot().length;
  await http('PATCH', `/api/messages/${msgId}/pin`, alice.cookie, { pinned: false });
  await sleep(600);
  newFrames = getSnapshot().slice(before);
  const uEvent = newFrames.find(f => f.op !== 'pong');
  observations.push({
    action: 'Unpin message (pinned=false)',
    newOps: newFrames.filter(f => f.op !== 'pong').map(f => f.op),
    eventOp: uEvent?.op,
    isPinned: uEvent?.d?.message?.pinned,
  });

  // 5. Create poll
  before = getSnapshot().length;
  const pollResp = await http('POST', `/api/channels/${channelId}/polls`, alice.cookie, {
    question: 'E7 Poll?', options: ['Yes', 'No', 'Maybe'],
  });
  await sleep(600);
  newFrames = getSnapshot().slice(before);
  const pollEvent = newFrames.find(f => f.op !== 'pong');
  observations.push({
    action: 'Create poll',
    newOps: newFrames.filter(f => f.op !== 'pong').map(f => f.op),
    eventOp: pollEvent?.op,
    hasPollData: pollEvent ? (!!pollEvent.d?.message?.poll) : null,
    pollShape: pollEvent?.d?.message?.poll ? Object.keys(pollEvent.d.message.poll) : null,
  });

  // 6. Vote on poll
  if (pollResp.data?.poll?.options?.[0]?.id) {
    const optId = pollResp.data.poll.options[0].id;
    before = getSnapshot().length;
    await http('POST', `/api/polls/options/${optId}/vote`, alice.cookie);
    await sleep(600);
    newFrames = getSnapshot().slice(before);
    const voteEvent = newFrames.find(f => f.op !== 'pong');
    observations.push({
      action: 'Vote on poll option',
      newOps: newFrames.filter(f => f.op !== 'pong').map(f => f.op),
      eventOp: voteEvent?.op,
    });
  }

  // 7. Mark read
  before = getSnapshot().length;
  await http('POST', `/api/channels/${channelId}/read`, alice.cookie, {
    lastReadMessageId: msgId,
  });
  await sleep(600);
  newFrames = getSnapshot().slice(before);
  observations.push({
    action: 'Mark read',
    newOps: newFrames.filter(f => f.op !== 'pong').map(f => f.op),
    note: 'Hypothesis from spec: read state has NO event (service: "we skip publishing")',
  });

  ws.close();

  const result = {
    experiment: 'E7',
    hypothesis: 'Reactions/pins arrive as message.updated with full message; read state has NO event',
    observations,
    verdict: 'RECORDED',
  };
  await writeFile(`${OUT_DIR}/E7.json`, JSON.stringify(result, null, 2));
  console.log('  Observations recorded');
}

// ═══════════ Main ═══════════
async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const exp = process.argv[2];
  const fn = { E2: runE2, E3: runE3, E7: runE7 }[exp];
  if (fn) { await fn(); console.log('Done.'); }
  else { console.log('Usage: node ws-probe.mjs E2|E3|E7'); }
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });