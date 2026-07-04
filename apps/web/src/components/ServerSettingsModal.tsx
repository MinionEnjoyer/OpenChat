import { useEffect, useRef, useState } from 'react';
import type { Server, User, Role, ServerMemberInfo } from '../lib/types';
import * as api from '../lib/api';
import { listFriends, createInvite } from '../lib/social';
import { uploadToShare } from '../lib/share';
import { Permission, PERMISSION_LIST, has, toBig } from '../lib/permissions';
import { Avatar } from './Avatar';

type Tab = 'overview' | 'roles' | 'members' | 'invite';

function extractError(err: any): string {
  const raw = String(err?.message ?? 'Something went wrong.');
  const m = raw.match(/\{.*\}/);
  if (m) {
    try {
      const body = JSON.parse(m[0]);
      if (typeof body.message === 'string') return body.message;
      if (Array.isArray(body.message)) return body.message.join(', ');
    } catch { /* ignore */ }
  }
  return raw.replace(/^API Error \d+:\s*/, '');
}

function colorToHex(c: number): string {
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

export function ServerSettingsModal({
  server,
  me,
  shareBaseUrl,
  onClose,
  onUpdated,
  onDeleted,
}: {
  server: Server;
  me: User;
  shareBaseUrl: string;
  onClose: () => void;
  onUpdated: (s: Server) => void;
  onDeleted: (serverId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<ServerMemberInfo[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [iconUrl, setIconUrl] = useState<string | null>(server.iconUrl);
  const [iconUploading, setIconUploading] = useState(false);
  const iconFileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(server.name);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [rName, setRName] = useState('');
  const [rColor, setRColor] = useState(0);
  const [rPerms, setRPerms] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pressedOnOverlay = useRef(false);

  const isOwner = me.id === server.ownerId;
  const canRoles = has(server.myPermissions, Permission.MANAGE_ROLES);
  const canMembers = has(server.myPermissions, Permission.MANAGE_MEMBERS);
  const canServer = has(server.myPermissions, Permission.MANAGE_SERVER);
  const canInvite = has(server.myPermissions, Permission.CREATE_INVITE);
  const selectedRole = roles.find((r) => r.id === selectedRoleId) || null;

  async function reload() {
    try {
      const [rs, ms, fr] = await Promise.all([
        api.listRoles(server.id).catch(() => [] as Role[]),
        api.listMembers(server.id).catch(() => [] as ServerMemberInfo[]),
        listFriends().catch(() => [] as User[]),
      ]);
      setRoles(rs);
      setMembers(ms);
      setFriends(fr);
    } catch (e) {
      setError(extractError(e));
    }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [server.id]);

  function selectRole(r: Role) {
    setSelectedRoleId(r.id);
    setRName(r.name);
    setRColor(r.color);
    setRPerms(toBig(r.permissions));
    setError(null);
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- Overview actions ----
  const saveOverview = () =>
    withBusy(async () => {
      const updated = await api.updateServer(server.id, { name: name.trim(), iconUrl: iconUrl || '' });
      onUpdated(updated);
    });

  async function handleIconFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!shareBaseUrl) { setError('Image hosting (Share) is not configured.'); return; }
    setIconUploading(true);
    setError(null);
    try {
      const { attachments } = await uploadToShare([file], shareBaseUrl);
      if (attachments[0]) setIconUrl(attachments[0].url);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setIconUploading(false);
    }
  }

  const deleteServer = () =>
    withBusy(async () => {
      if (!window.confirm(`Delete "${server.name}"? This permanently removes all its channels and messages.`)) return;
      await api.deleteServer(server.id);
      onDeleted(server.id);
    });

  // ---- Role actions ----
  const newRole = () =>
    withBusy(async () => {
      const created = await api.createRole(server.id, { name: 'new role', permissions: '0' });
      const rs = await api.listRoles(server.id);
      setRoles(rs);
      selectRole(created);
    });

  const saveRole = () =>
    withBusy(async () => {
      if (!selectedRoleId) return;
      await api.updateRole(server.id, selectedRoleId, {
        name: rName.trim(),
        color: rColor,
        permissions: rPerms.toString(),
      });
      await reload();
    });

  const removeRole = () =>
    withBusy(async () => {
      if (!selectedRoleId) return;
      if (!window.confirm(`Delete role "${rName}"?`)) return;
      await api.deleteRole(server.id, selectedRoleId);
      setSelectedRoleId(null);
      await reload();
    });

  function togglePerm(bit: bigint) {
    setRPerms((p) => (p & bit ? p & ~bit : p | bit));
  }

  // ---- Member actions ----
  const toggleMemberRole = (m: ServerMemberInfo, roleId: string) =>
    withBusy(async () => {
      const hasRole = m.roleIds.includes(roleId);
      if (hasRole) await api.unassignRole(server.id, m.userId, roleId);
      else await api.assignRole(server.id, m.userId, roleId);
      const ms = await api.listMembers(server.id);
      setMembers(ms);
    });

  const kick = (m: ServerMemberInfo) =>
    withBusy(async () => {
      if (!window.confirm(`Kick ${m.user.displayName || m.user.username}?`)) return;
      await api.kickMember(server.id, m.userId);
      setMembers((prev) => prev.filter((x) => x.userId !== m.userId));
    });

  // ---- Invite actions ----
  const genCode = () =>
    withBusy(async () => {
      const invite = await createInvite(server.id);
      setInviteCode(invite.code);
    });

  const inviteFriend = (friend: User) =>
    withBusy(async () => {
      await api.inviteMember(server.id, friend.id);
      setInvited((prev) => new Set(prev).add(friend.id));
    });

  const memberIds = new Set(members.map((m) => m.userId));
  const invitableFriends = friends.filter((f) => !memberIds.has(f.id));

  // ---- styling ----
  const tabBtn = (t: Tab, label: string, show: boolean) =>
    show ? (
      <button
        onClick={() => { setTab(t); setError(null); }}
        style={{
          padding: '8px 12px',
          textAlign: 'left',
          background: tab === t ? 'var(--hover)' : 'none',
          border: 'none',
          borderRadius: 4,
          color: tab === t ? 'var(--text-strong)' : 'var(--muted)',
          cursor: 'pointer',
          fontWeight: 600,
          width: '100%',
        }}
      >
        {label}
      </button>
    ) : null;

  const input: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 4, border: '1px solid var(--border)',
    background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: 14,
  };
  const primaryBtn: React.CSSProperties = {
    padding: '9px 16px', borderRadius: 4, border: 'none', background: 'var(--accent)',
    color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600,
  };
  const dangerBtn: React.CSSProperties = {
    padding: '9px 16px', borderRadius: 4, border: 'none', background: 'var(--danger)',
    color: '#fff', cursor: 'pointer', fontWeight: 600,
  };
  const sectionLabel: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 8,
  };

  return (
    <div
      onMouseDown={(e) => { pressedOnOverlay.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && pressedOnOverlay.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--panel)', color: 'var(--text)', borderRadius: 10, width: '100%',
          maxWidth: 720, height: '80vh', maxHeight: 620, display: 'flex', overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        {/* sidebar tabs */}
        <div style={{ width: 180, background: 'var(--panel-dark)', padding: 12, display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-strong)', padding: '4px 12px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {server.name}
          </div>
          {tabBtn('overview', 'Overview', canServer || isOwner)}
          {tabBtn('invite', 'Invite People', canInvite)}
          {tabBtn('roles', 'Roles', canRoles)}
          {tabBtn('members', 'Members', true)}
        </div>

        {/* content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-strong)', textTransform: 'capitalize' }}>{tab}</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {error && <p style={{ color: 'var(--danger)', marginTop: 0 }}>{error}</p>}

            {tab === 'overview' && (
              <div>
                <span style={sectionLabel}>Server Icon</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                  <Avatar user={{ username: name, displayName: name, avatarUrl: iconUrl }} size={64} />
                  {canServer && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input ref={iconFileRef} type="file" accept="image/*" hidden onChange={handleIconFile} />
                      <button style={primaryBtn} onClick={() => iconFileRef.current?.click()} disabled={iconUploading}>
                        {iconUploading ? 'Uploading…' : 'Change Icon'}
                      </button>
                      {iconUrl && (
                        <button onClick={() => setIconUrl(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Remove</button>
                      )}
                    </div>
                  )}
                </div>

                <span style={sectionLabel}>Server Name</span>
                <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                  <input style={input} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} disabled={!canServer} />
                  <button style={primaryBtn} onClick={saveOverview} disabled={busy || !canServer}>Save</button>
                </div>
                {isOwner && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                    <span style={sectionLabel}>Danger Zone</span>
                    <button style={dangerBtn} onClick={deleteServer} disabled={busy}>Delete Server</button>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 0 }}>
                      Permanently deletes the server and all of its channels and messages.
                    </p>
                  </div>
                )}
              </div>
            )}

            {tab === 'invite' && (
              <div>
                <span style={sectionLabel}>Invite Link Code</span>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <input
                    style={{ ...input, fontFamily: 'ui-monospace, Menlo, monospace' }}
                    readOnly
                    value={inviteCode ?? ''}
                    placeholder="Generate a code to share"
                    onClick={(e) => e.currentTarget.select()}
                  />
                  {inviteCode ? (
                    <button style={primaryBtn} onClick={() => navigator.clipboard?.writeText(inviteCode)}>Copy</button>
                  ) : (
                    <button style={primaryBtn} onClick={genCode} disabled={busy}>Generate</button>
                  )}
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 0 }}>
                  Anyone with this code can join via “Join a Server”.
                </p>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
                  <span style={sectionLabel}>Invite a Friend</span>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
                    Sends an invitation they must accept from their notifications.
                  </p>
                  {invitableFriends.length === 0 ? (
                    <p style={{ color: 'var(--muted)' }}>
                      {friends.length === 0 ? 'You have no friends to add yet.' : 'All your friends are already in this server.'}
                    </p>
                  ) : (
                    invitableFriends.map((f) => (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel-dark)', borderRadius: 6, padding: 10, marginBottom: 6 }}>
                        <Avatar user={f} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.displayName || f.username}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>@{f.username}</div>
                        </div>
                        {invited.has(f.id) ? (
                          <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>Invited ✓</span>
                        ) : (
                          <button style={primaryBtn} onClick={() => inviteFriend(f)} disabled={busy}>Invite</button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {tab === 'roles' && (
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ width: 180, flexShrink: 0 }}>
                  <button style={{ ...primaryBtn, width: '100%', marginBottom: 10 }} onClick={newRole} disabled={busy}>+ New Role</button>
                  {roles.map((r) => (
                    <div key={r.id} onClick={() => selectRole(r)}
                      style={{
                        padding: '8px 10px', borderRadius: 4, cursor: 'pointer', marginBottom: 2,
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: r.id === selectedRoleId ? 'var(--hover)' : 'transparent',
                        color: r.id === selectedRoleId ? 'var(--text-strong)' : 'var(--text)',
                      }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: colorToHex(r.color), flexShrink: 0, border: '1px solid var(--border)' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    </div>
                  ))}
                  {roles.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>No roles yet.</p>}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {selectedRole ? (
                    <>
                      <span style={sectionLabel}>Role Name</span>
                      <input style={{ ...input, marginBottom: 16 }} value={rName} maxLength={60} onChange={(e) => setRName(e.target.value)} />

                      <span style={sectionLabel}>Color</span>
                      <input type="color" value={colorToHex(rColor)} onChange={(e) => setRColor(parseInt(e.target.value.slice(1), 16))}
                        style={{ width: 48, height: 32, border: 'none', background: 'none', cursor: 'pointer', marginBottom: 16, display: 'block' }} />

                      <span style={sectionLabel}>Permissions</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                        {PERMISSION_LIST.map((p) => (
                          <label key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                            <input type="checkbox" checked={(rPerms & p.bit) !== 0n} onChange={() => togglePerm(p.bit)} />
                            {p.label}
                          </label>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: 10 }}>
                        <button style={primaryBtn} onClick={saveRole} disabled={busy}>Save Role</button>
                        <button style={dangerBtn} onClick={removeRole} disabled={busy}>Delete Role</button>
                      </div>
                    </>
                  ) : (
                    <p style={{ color: 'var(--muted)' }}>Select a role to edit, or create a new one.</p>
                  )}
                </div>
              </div>
            )}

            {tab === 'members' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {members.map((m) => (
                  <div key={m.userId} style={{ background: 'var(--panel-dark)', borderRadius: 6, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar user={m.user} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                          {m.user.displayName || m.user.username}
                          {m.isOwner && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)' }}>👑 Owner</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>@{m.user.username}</div>
                      </div>
                      {canMembers && !m.isOwner && m.userId !== me.id && (
                        <button style={{ ...dangerBtn, padding: '6px 12px' }} onClick={() => kick(m)} disabled={busy}>Kick</button>
                      )}
                    </div>
                    {canRoles && roles.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        {roles.map((r) => {
                          const assigned = m.roleIds.includes(r.id);
                          return (
                            <button key={r.id} onClick={() => toggleMemberRole(m, r.id)} disabled={busy}
                              style={{
                                padding: '3px 10px', borderRadius: 12, fontSize: 12, cursor: 'pointer',
                                border: '1px solid ' + (assigned ? 'var(--accent)' : 'var(--border)'),
                                background: assigned ? 'var(--accent)' : 'transparent',
                                color: assigned ? 'var(--accent-text)' : 'var(--muted)',
                              }}>
                              {assigned ? '✓ ' : '+ '}{r.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {members.length === 0 && <p style={{ color: 'var(--muted)' }}>No members.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
