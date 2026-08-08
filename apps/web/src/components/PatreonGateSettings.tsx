import { useEffect, useState } from 'react';
import {
  deletePatreonGate,
  getPatreonGate,
  updatePatreonGate,
  type PatreonGateConfig,
} from '../lib/api';
import { OpenChatSpinner } from './OpenChatSpinner';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^API Error \d+:\s*/, '');
  return 'Patreon settings could not be updated.';
}

export function PatreonGateSettings({ serverId }: { serverId: string }) {
  const [config, setConfig] = useState<PatreonGateConfig | null>(null);
  const [campaignId, setCampaignId] = useState('');
  const [minimumDollars, setMinimumDollars] = useState('0');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    getPatreonGate(serverId)
      .then((result) => {
        if (cancelled) return;
        setConfig(result);
        setCampaignId(result.gate?.campaignId ?? '');
        setMinimumDollars(((result.gate?.minimumCents ?? 0) / 100).toFixed(2));
        setEnabled(result.gate?.enabled ?? true);
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [serverId]);

  async function save() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const dollars = Number(minimumDollars);
      if (!/^\d+$/.test(campaignId)) throw new Error('Campaign ID must contain only digits.');
      if (!Number.isFinite(dollars) || dollars < 0) throw new Error('Minimum monthly support must be zero or greater.');
      const result = await updatePatreonGate(serverId, {
        campaignId,
        minimumCents: Math.round(dollars * 100),
        enabled,
      });
      setConfig(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Remove the Patreon membership gate for this server?')) return;
    setBusy(true);
    setError(null);
    try {
      await deletePatreonGate(serverId);
      setConfig((current) => current ? { ...current, gate: null, joinUrl: null } : current);
      setCampaignId('');
      setMinimumDollars('0.00');
      setEnabled(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyJoinUrl() {
    if (!config?.joinUrl) return;
    await navigator.clipboard.writeText(config.joinUrl);
    setCopied(true);
  }

  const input: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 4,
    border: '1px solid var(--border)',
    background: 'var(--input-bg)',
    color: 'var(--text)',
    boxSizing: 'border-box',
  };
  const button: React.CSSProperties = {
    padding: '9px 16px',
    borderRadius: 4,
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--accent-text)',
    cursor: 'pointer',
    fontWeight: 600,
  };

  if (busy && !config) {
    return <OpenChatSpinner size={32} label="Loading Patreon settings" />;
  }

  return (
    <div data-testid="patreon-gate-settings">
      <h3 style={{ marginTop: 0, color: 'var(--text-strong)' }}>Patreon membership invitations</h3>
      <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
        Verify a supporter&apos;s current Patreon membership before issuing a one-use OpenChat invite.
        OpenChat does not retain the supporter&apos;s Patreon access token.
      </p>
      {!config?.available && (
        <p role="status" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 6 }}>
          The host operator must configure Patreon OAuth before this feature can be enabled.
        </p>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Campaign ID</span>
        <input
          aria-label="Patreon campaign ID"
          style={input}
          inputMode="numeric"
          value={campaignId}
          onChange={(event) => setCampaignId(event.target.value.trim())}
          placeholder="1234567"
          disabled={!config?.available || busy}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Minimum monthly support (USD)</span>
        <input
          aria-label="Minimum monthly support"
          style={input}
          type="number"
          min="0"
          step="0.01"
          value={minimumDollars}
          onChange={(event) => setMinimumDollars(event.target.value)}
          disabled={!config?.available || busy}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          disabled={!config?.available || busy}
        />
        Accept new Patreon-verified invitations
      </label>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button style={button} onClick={save} disabled={!config?.available || busy || !campaignId}>
          {busy ? 'Saving...' : 'Save Patreon settings'}
        </button>
        {config?.gate && (
          <button
            onClick={remove}
            disabled={busy}
            style={{ ...button, background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)' }}
          >
            Remove
          </button>
        )}
      </div>

      {config?.joinUrl && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 22, paddingTop: 18 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }} htmlFor="patreon-join-url">
            Supporter invitation URL
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="patreon-join-url" style={input} readOnly value={config.joinUrl} onFocus={(event) => event.currentTarget.select()} />
            <button style={button} onClick={copyJoinUrl}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>
            Share this URL with supporters. Eligibility is checked against Patreon when they use it.
          </p>
        </div>
      )}
    </div>
  );
}
