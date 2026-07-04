import { useRef, useState } from 'react';

export function CreateChannelModal({
  onCreate,
  onClose,
}: {
  onCreate: (name: string, type: 'TEXT' | 'VOICE') => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'TEXT' | 'VOICE'>('TEXT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pressedOnOverlay = useRef(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim(), type);
      onClose();
    } catch (e: any) {
      setError(e?.message?.replace(/^API Error \d+:\s*/, '') || 'Could not create channel.');
    } finally {
      setBusy(false);
    }
  }

  const typeBtn = (t: 'TEXT' | 'VOICE', label: string): React.CSSProperties => ({
    flex: 1,
    padding: '12px',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    textAlign: 'left',
    background: 'var(--input-bg)',
    color: 'var(--text)',
    border: type === t ? '2px solid var(--accent)' : '2px solid var(--border)',
  });

  return (
    <div
      onMouseDown={(e) => { pressedOnOverlay.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && pressedOnOverlay.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
    >
      <div style={{ background: 'var(--panel)', color: 'var(--text)', borderRadius: 10, width: '100%', maxWidth: 440, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-strong)' }}>Create Channel</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        <span style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 8 }}>Channel Type</span>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <button style={typeBtn('TEXT', 'Text')} onClick={() => setType('TEXT')}>
            <div># Text</div>
            <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>Send messages, files</div>
          </button>
          <button style={typeBtn('VOICE', 'Voice')} onClick={() => setType('VOICE')}>
            <div>🔊 Voice</div>
            <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>Talk with mic</div>
          </button>
        </div>

        <span style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 8 }}>Channel Name</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', marginBottom: 16 }}>
          <span style={{ color: 'var(--muted)' }}>{type === 'VOICE' ? '🔊' : '#'}</span>
          <input
            autoFocus
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value.replace(/\s+/g, '-').toLowerCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="new-channel"
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', outline: 'none', padding: '10px 0' }}
          />
        </div>

        {error && <p style={{ color: 'var(--danger)', marginTop: 0 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={busy || !name.trim()}
            style={{ padding: '10px 20px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: busy || !name.trim() ? 'default' : 'pointer', fontWeight: 600, opacity: !name.trim() ? 0.6 : 1 }}>
            {busy ? 'Creating…' : 'Create Channel'}
          </button>
        </div>
      </div>
    </div>
  );
}
