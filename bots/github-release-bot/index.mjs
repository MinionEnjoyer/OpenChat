// OpenChat GitHub release bot.
// Connects as a bot account, listens for `!gh` commands in channels it's in, and posts a
// message when a watched GitHub repo publishes a new release. Config is per-channel and set
// live via chat commands (no redeploy needed). State persists to a JSON file.
import WebSocket from 'ws';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const OPENCHAT_URL = (process.env.OPENCHAT_URL || 'https://chat.creeger.com').replace(/\/$/, '');
const API = `${OPENCHAT_URL}/api`;
const WS_BASE = OPENCHAT_URL.replace(/^http/, 'ws');
const TOKEN = process.env.BOT_TOKEN;
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const POLL_MS = Math.max(60, parseInt(process.env.POLL_INTERVAL_SEC || '300', 10)) * 1000;
const PREFIX = (process.env.CMD_PREFIX || '!gh').toLowerCase();
const DATA_FILE = process.env.DATA_FILE || './data/watches.json';

if (!TOKEN) { console.error('BOT_TOKEN is required'); process.exit(1); }

// ---- state: watches[channelId] = [repo]; seen[repo] = last release id ----
let state = { watches: {}, seen: {} };
try { state = { watches: {}, seen: {}, ...JSON.parse(readFileSync(DATA_FILE, 'utf8')) }; } catch { /* fresh */ }
function save() {
  try { mkdirSync(dirname(DATA_FILE), { recursive: true }); writeFileSync(DATA_FILE, JSON.stringify(state, null, 2)); }
  catch (e) { console.error('save failed:', e.message); }
}

// ---- OpenChat REST ----
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`API ${opts.method || 'GET'} ${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}
const post = (channelId, content) => api(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ content }) });

// ---- channel discovery + WS subscribe ----
let ws = null;
const subscribed = new Set();
async function myTextChannels() {
  const servers = await api('/servers').catch(() => []);
  const out = [];
  for (const s of servers) {
    const chans = await api(`/servers/${s.id}/channels`).catch(() => []);
    for (const c of chans) if (c.type === 'TEXT' || c.type === 'ANNOUNCEMENT') out.push(c.id);
  }
  return out;
}
async function refreshSubscriptions() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  for (const id of await myTextChannels()) {
    if (!subscribed.has(id)) { ws.send(JSON.stringify({ op: 'subscribe', d: { channelId: id } })); subscribed.add(id); }
  }
}

// ---- WS connect (auto-reconnect) ----
async function connect() {
  let ticket;
  try { ({ ticket } = await api('/auth/ws-ticket')); }
  catch (e) { console.error('ws-ticket failed:', e.message); return void setTimeout(connect, 5000); }
  ws = new WebSocket(`${WS_BASE}/ws?ticket=${ticket}&platform=web`);
  ws.on('open', () => { console.log('ws connected'); subscribed.clear(); refreshSubscriptions(); });
  ws.on('message', (buf) => {
    let env; try { env = JSON.parse(buf.toString()); } catch { return; }
    if (env.op === 'message.created') handleMessage(env.d?.message).catch((e) => console.error('handle err:', e.message));
  });
  ws.on('close', () => { console.log('ws closed; reconnecting'); ws = null; setTimeout(connect, 3000); });
  ws.on('error', (e) => { console.error('ws error:', e.message); try { ws.close(); } catch { /* ignore */ } });
}

// ---- commands ----
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
function normRepo(s) { return (s || '').replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/,''); }
async function handleMessage(m) {
  if (!m || m.author?.isBot) return;                       // ignore bots (incl. self) → no loops
  const text = (m.content || '').trim();
  if (!text.toLowerCase().startsWith(PREFIX)) return;
  const args = text.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = (args.shift() || '').toLowerCase();
  const ch = m.channelId;

  if (cmd === 'watch') {
    const repo = normRepo(args[0]);
    if (!REPO_RE.test(repo)) return void post(ch, `Usage: \`${PREFIX} watch owner/repo\``);
    const list = state.watches[ch] || (state.watches[ch] = []);
    if (!list.includes(repo)) list.push(repo);
    if (state.seen[repo] === undefined) { const r = await latestRelease(repo); state.seen[repo] = r ? r.id : null; }
    save();
    await post(ch, `✅ Watching **${repo}** for new releases in this channel.`);
  } else if (cmd === 'unwatch') {
    const repo = normRepo(args[0]);
    state.watches[ch] = (state.watches[ch] || []).filter((r) => r !== repo);
    save();
    await post(ch, `🛑 Unwatched **${repo}** here.`);
  } else if (cmd === 'list') {
    const list = state.watches[ch] || [];
    await post(ch, list.length ? `Watching in this channel:\n${list.map((r) => `• ${r}`).join('\n')}` : `Not watching anything here. Try \`${PREFIX} watch owner/repo\`.`);
  } else if (cmd === 'latest') {
    const repo = normRepo(args[0]);
    if (!REPO_RE.test(repo)) return void post(ch, `Usage: \`${PREFIX} latest owner/repo\``);
    const r = await latestRelease(repo);
    if (!r) return void post(ch, `No releases found for **${repo}** (repo may be private or have no GitHub Releases).`);
    await post(ch, `🔎 Latest for **${repo}**: **${r.tag_name}**${r.name && r.name !== r.tag_name ? ` — ${r.name}` : ''}\n${r.html_url}`);
  } else {
    // Any unrecognized subcommand (incl. `help` and a bare prefix) prints the command list.
    await post(ch, `**GitHub release bot** — I post here when a watched repo ships a release.\n• \`${PREFIX} watch owner/repo\` — announce new releases here\n• \`${PREFIX} unwatch owner/repo\` — stop\n• \`${PREFIX} list\` — repos watched in this channel\n• \`${PREFIX} latest owner/repo\` — post the current latest now\n• \`${PREFIX} help\` — this message`);
  }
}

// ---- GitHub polling ----
async function latestRelease(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=1`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'openchat-release-bot', ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}) },
  });
  if (!res.ok) return null;
  const arr = await res.json();
  return Array.isArray(arr) && arr[0] ? arr[0] : null;
}
async function poll() {
  const repos = new Set();
  for (const list of Object.values(state.watches)) for (const r of list) repos.add(r);
  for (const repo of repos) {
    try {
      const r = await latestRelease(repo);
      if (!r) continue;
      if (state.seen[repo] === r.id) continue;
      const firstSight = state.seen[repo] === undefined || state.seen[repo] === null;
      state.seen[repo] = r.id; save();
      if (firstSight) continue;                             // don't announce the pre-existing latest
      const content = `🚀 **${repo}** released **${r.tag_name}**${r.name && r.name !== r.tag_name ? ` — ${r.name}` : ''}\n${r.html_url}`;
      const channels = Object.entries(state.watches).filter(([, l]) => l.includes(repo)).map(([c]) => c);
      for (const ch of channels) await post(ch, content).catch((e) => console.error('post err:', e.message));
      console.log(`announced ${repo} ${r.tag_name} to ${channels.length} channel(s)`);
    } catch (e) { console.error('poll err', repo, e.message); }
  }
}

// ---- boot ----
console.log(`github-release-bot → ${OPENCHAT_URL} (prefix "${PREFIX}", poll ${POLL_MS / 1000}s)`);
await connect();
setInterval(refreshSubscriptions, 60_000);
setInterval(poll, POLL_MS);
setTimeout(poll, 8_000);
