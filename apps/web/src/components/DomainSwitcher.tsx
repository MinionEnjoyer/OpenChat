import { useState } from 'react';
import { isTauri } from './TitleBar';
import {
  listDomains, activeDomain, switchDomain, removeDomain, beginAddServer,
  listWebDomains, activeWebDomain, switchWebDomain, removeWebDomain,
} from '../lib/serverConfig';

/**
 * Multi-server switcher. Native clients keep a token family per origin; browsers perform a
 * full-origin navigation and let each server retain its own origin-scoped session.
 */
export function DomainSwitcher({ label }: { label: React.CSSProperties }) {
  const native = isTauri();
  const readDomains = () => native ? listDomains() : listWebDomains();
  const [domains, setDomains] = useState<string[]>(readDomains);
  const [serverUrl, setServerUrlInput] = useState('');
  const [error, setError] = useState('');
  const active = native ? activeDomain() : activeWebDomain();

  function go(origin: string) {
    if (origin === active) return;
    if (native) {
      switchDomain(origin);
      window.location.reload();
    } else {
      switchWebDomain(origin);
    }
  }
  function addServer() {
    if (native) {
      beginAddServer();
      window.location.reload();
      return;
    }
    setError('');
    if (!switchWebDomain(serverUrl)) setError('Enter a valid OpenChat server address.');
  }
  function forget(origin: string) {
    if (origin === active && !native) return;
    if (!window.confirm(`Forget ${origin}? You'll need to enter it again to reconnect.`)) return;
    if (native) {
      removeDomain(origin);
      if (origin === active) { beginAddServer(); window.location.reload(); return; }
    } else {
      removeWebDomain(origin);
    }
    setDomains(readDomains());
  }

  const btn: React.CSSProperties = { border: '1px solid var(--border)', background: 'none', color: 'var(--text)', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', fontSize: 12 };

  return (
    <div>
      <span style={label}>Servers</span>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)' }}>
        {native
          ? "Switch between OpenChat servers you've signed into. Each keeps its own sign-in."
          : 'Switch this browser to another OpenChat domain. Sign-ins remain private to each domain.'}
      </p>
      {domains.map((o) => (
        <div className="settings-list-row settings-domain-row" key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--text-strong)', fontWeight: o === active ? 700 : 500 }}>{o.replace(/^https?:\/\//, '')}</span>
            {o === active && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)' }}>● current</span>}
          </div>
          <div className="settings-row-actions">
            {o !== active && <button onClick={() => go(o)} style={{ ...btn, borderColor: 'var(--accent)', color: 'var(--accent)' }}>Switch</button>}
            {(native || o !== active) && <button onClick={() => forget(o)} style={{ ...btn, color: 'var(--muted)' }}>Forget</button>}
          </div>
        </div>
      ))}
      {native ? (
        <button onClick={addServer} style={{ ...btn, marginTop: 14 }}>+ Add a server</button>
      ) : (
        <form className="settings-inline-form" onSubmit={(event) => { event.preventDefault(); addServer(); }} style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input value={serverUrl} onChange={(event) => setServerUrlInput(event.target.value)}
            aria-label="OpenChat server address" placeholder="chat.example.com"
            style={{ flex: 1, minWidth: 0, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', borderRadius: 4, padding: '7px 9px', fontSize: 12 }} />
          <button type="submit" style={btn}>Open server</button>
        </form>
      )}
      {error && <p role="alert" style={{ margin: '8px 0 0', color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
    </div>
  );
}
