import { useState } from 'react';
import { listDomains, activeDomain, switchDomain, removeDomain, beginAddServer } from '../lib/serverConfig';

/**
 * Multi-server switcher (desktop). Lists OpenChat servers the user has signed into (each keeps
 * its own token family), lets them switch the active one, add a new one, or forget one.
 */
export function DomainSwitcher({ label }: { label: React.CSSProperties }) {
  const [domains, setDomains] = useState<string[]>(() => listDomains());
  const active = activeDomain();

  function go(origin: string) {
    if (origin === active) return;
    switchDomain(origin);
    window.location.reload();
  }
  function addServer() { beginAddServer(); window.location.reload(); }
  function forget(origin: string) {
    if (!window.confirm(`Forget ${origin}? You'll need to sign in again to reconnect.`)) return;
    removeDomain(origin);
    if (origin === active) { beginAddServer(); window.location.reload(); return; }
    setDomains(listDomains());
  }

  const btn: React.CSSProperties = { border: '1px solid var(--border)', background: 'none', color: 'var(--text)', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', fontSize: 12 };

  return (
    <div>
      <span style={label}>Servers</span>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)' }}>
        Switch between OpenChat servers you've signed into. Each is remembered on a successful sign-in.
      </p>
      {domains.map((o) => (
        <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--text-strong)', fontWeight: o === active ? 700 : 500 }}>{o.replace(/^https?:\/\//, '')}</span>
            {o === active && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)' }}>● current</span>}
          </div>
          {o !== active && <button onClick={() => go(o)} style={{ ...btn, borderColor: 'var(--accent)', color: 'var(--accent)' }}>Switch</button>}
          <button onClick={() => forget(o)} style={{ ...btn, color: 'var(--muted)' }}>Forget</button>
        </div>
      ))}
      <button onClick={addServer} style={{ ...btn, marginTop: 14 }}>+ Add a server</button>
    </div>
  );
}
