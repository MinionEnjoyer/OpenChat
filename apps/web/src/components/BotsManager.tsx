import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import type { Bot } from '../lib/types';

/**
 * Developer view: create + manage your bot accounts. A bot's token is shown once (on
 * creation or regenerate). Publish a bot to make it appear in servers' add-bot browser.
 */
export function BotsManager({ label, input }: { label: React.CSSProperties; input: React.CSSProperties }) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ id: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() { try { setBots(await api.listBots()); } catch { /* ignore */ } }
  useEffect(() => { load(); }, []);

  async function create() {
    setBusy(true); setError(null);
    try {
      const { bot, token } = await api.createBot({
        username: username.trim(),
        displayName: displayName.trim() || undefined,
        description: description.trim() || undefined,
      });
      setFresh({ id: bot.id, token }); setCopied(false);
      setUsername(''); setDisplayName(''); setDescription('');
      await load();
    } catch (e: any) {
      // request() throws `API Error 400: {json}` — pull out the server's human message.
      let msg = (e?.message || '').replace(/^API Error \d+: /, '');
      try { const j = JSON.parse(msg); msg = j.message || msg; } catch { /* not json */ }
      setError(msg || 'Could not create bot');
    } finally { setBusy(false); }
  }

  async function togglePublish(b: Bot) { try { await api.updateBot(b.id, { published: !b.botPublished }); await load(); } catch { /* ignore */ } }
  async function regen(id: string) { try { const { token } = await api.resetBotToken(id); setFresh({ id, token }); setCopied(false); } catch { /* ignore */ } }
  async function del(id: string) {
    if (!window.confirm('Delete this bot? Its token stops working and it leaves every server.')) return;
    try { await api.deleteBot(id); if (fresh?.id === id) setFresh(null); await load(); } catch { /* ignore */ }
  }
  function copyToken() { if (fresh) { navigator.clipboard?.writeText(fresh.token).then(() => setCopied(true)).catch(() => {}); } }

  const smallBtn: React.CSSProperties = { background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 12 };

  return (
    <div>
      <span style={label}>Create a Bot</span>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
        Bots use their token to talk to the API + WebSocket, just like any client. Publish a bot to add it to servers from the add-bot browser.
      </p>
      <input style={{ ...input, marginBottom: 4 }} value={username} maxLength={32}
        placeholder="username handle, e.g. releasebot"
        onChange={(e) => setUsername(e.target.value)} />
      <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--muted)' }}>
        Handle — 2–32 chars, letters/numbers/<code>. _ -</code> only (no spaces).
      </p>
      <input style={{ ...input, marginBottom: 8 }} value={displayName} maxLength={80} placeholder="display name (optional, spaces OK)" onChange={(e) => setDisplayName(e.target.value)} />
      <input style={{ ...input, marginBottom: 8 }} value={description} maxLength={300} placeholder="what does it do? (optional)" onChange={(e) => setDescription(e.target.value)} />
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 8px' }}>{error}</p>}
      <button onClick={create} disabled={!username.trim() || busy}
        style={{ padding: '9px 16px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: busy || !username.trim() ? 'default' : 'pointer', fontWeight: 700, opacity: busy || !username.trim() ? 0.6 : 1 }}>
        {busy ? 'Creating…' : 'Create Bot'}
      </button>

      {fresh && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'var(--input-bg)', border: '1px solid var(--accent)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Bot token — copy it now, it won't be shown again:</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text)' }}>{fresh.token}</code>
            <button onClick={copyToken} style={smallBtn}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
      )}

      <span style={{ ...label, marginTop: 22, display: 'block' }}>Your Bots</span>
      {bots.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>No bots yet.</p>}
      {bots.map((b) => (
        <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{b.displayName || b.username}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              @{b.username}{b.botDescription ? ` — ${b.botDescription}` : ''}
            </div>
          </div>
          <button onClick={() => togglePublish(b)} style={{ ...smallBtn, borderColor: b.botPublished ? 'var(--accent)' : 'var(--border)', color: b.botPublished ? 'var(--accent)' : 'var(--muted)' }}>
            {b.botPublished ? 'Published' : 'Publish'}
          </button>
          <button onClick={() => regen(b.id)} style={smallBtn}>New token</button>
          <button onClick={() => del(b.id)} style={{ ...smallBtn, color: 'var(--danger)', borderColor: 'var(--danger)' }}>Delete</button>
        </div>
      ))}
    </div>
  );
}
