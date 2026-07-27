import React, { useState, useEffect } from 'react';
import {
  listFriends,
  listFriendRequests,
  sendFriendRequest,
  addFriendByCode,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  blockUser,
  openDm,
} from '../lib/social';
import type { User } from '../lib/types';
import { Avatar } from './Avatar';

const COLORS = {
  bg: 'var(--bg)',
  panel: 'var(--panel)',
  darkerPanel: 'var(--panel-dark)',
  hover: 'var(--hover)',
  accent: 'var(--accent)',
  text: 'var(--text)',
  muted: 'var(--muted)',
};

const ACTIVE_STATUSES = ['ONLINE', 'AWAY', 'DND'];

export function FriendsView({ me, onOpenDm, reloadKey, presenceById }: { me: User; onOpenDm: (channelId: string, title: string) => void; reloadKey?: number; presenceById?: Record<string, string> }) {
  const [friends, setFriends] = useState<User[]>([]);
  const [requests, setRequests] = useState<{ incoming: { id: string; user: User }[], outgoing: { id: string; user: User }[] }>({ incoming: [], outgoing: [] });

  // Add Friend State
  const [usernameInput, setUsernameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [friendsData, requestsData] = await Promise.all([
        listFriends(),
        listFriendRequests(),
      ]);
      setFriends(friendsData);
      setRequests(requestsData);
    } catch (e) {
      console.error('Failed to load social data', e);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const handleAddFriend = async () => {
    if (!usernameInput.trim()) return;
    setActionMessage(null);
    try {
      await sendFriendRequest(usernameInput.trim());
      setUsernameInput('');
      setActionMessage('Friend request sent!');
      loadData(); // Reload to update outgoing requests
    } catch (e: any) {
      setActionMessage(e.message || 'Failed to send friend request.');
    }
  };

  const handleAddByCode = async () => {
    const code = codeInput.trim();
    if (!/^\d{8}$/.test(code)) {
      setActionMessage('Enter a valid 8-digit friend code.');
      return;
    }
    setActionMessage(null);
    try {
      await addFriendByCode(code);
      setCodeInput('');
      setActionMessage('Friend request sent!');
      loadData();
    } catch (e: any) {
      setActionMessage(e.message || 'Failed to send friend request.');
    }
  };

  const copyMyCode = () => {
    if (me.friendCode) navigator.clipboard?.writeText(me.friendCode);
  };

  const handleAccept = async (id: string) => {
    setRequests((r) => ({ ...r, incoming: r.incoming.filter((x) => x.id !== id) })); // optimistic
    try { await acceptFriendRequest(id); } catch (e) { console.error('Failed to accept', e); }
    loadData();
  };

  const handleDecline = async (id: string) => {
    setRequests((r) => ({ ...r, incoming: r.incoming.filter((x) => x.id !== id) })); // optimistic
    try { await declineFriendRequest(id); } catch (e) { console.error('Failed to decline', e); }
    loadData();
  };

  const handleRemoveFriend = async (userId: string) => {
    if (!window.confirm('Are you sure you want to remove this friend?')) return;
    setFriends((f) => f.filter((x) => x.id !== userId)); // optimistic
    try { await removeFriend(userId); } catch (e) { console.error('Failed to remove friend', e); loadData(); }
  };

  const handleBlock = async (userId: string) => {
    if (!window.confirm('Block this user? They will be removed from your friends.')) return;
    setFriends((f) => f.filter((x) => x.id !== userId)); // optimistic
    try { await blockUser(userId); } catch (e) { console.error('Failed to block user', e); loadData(); }
  };

  const handleOpenDm = async (friend: User) => {
    // openDm is idempotent server-side (returns the existing 1:1 channel or creates one).
    try {
      const dm = await openDm(friend.id);
      onOpenDm(dm.id, friend.displayName || friend.username);
    } catch (e) {
      console.error('Failed to open DM', e);
    }
  };

  // Online is derived from the live presence set (authoritative), not the friend's stored
  // status column, which is only their saved preference and can be stale.
  const decorated = friends.map((friend) => {
    const status = presenceById?.[friend.id] ?? 'OFFLINE';
    return { friend, status, online: ACTIVE_STATUSES.includes(status) };
  });
  const onlineCount = decorated.filter((f) => f.online).length;
  const sortedFriends = [...decorated].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return (a.friend.displayName || a.friend.username).localeCompare(b.friend.displayName || b.friend.username);
  });

  const styles = {
    container: {
      backgroundColor: COLORS.bg,
      color: COLORS.text,
      padding: '20px',
      flex: 1,
      minHeight: 0,
      overflowY: 'auto' as const,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    section: {
      marginBottom: '30px',
      backgroundColor: COLORS.panel,
      borderRadius: '8px',
      padding: '15px',
    },
    header: {
      fontSize: '24px',
      fontWeight: 'bold',
      marginBottom: '15px',
      color: 'var(--text-strong)',
    },
    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px',
      backgroundColor: COLORS.darkerPanel,
      borderRadius: '4px',
      marginBottom: '8px',
    },
    input: {
      flex: 1,
      padding: '10px',
      borderRadius: '4px',
      border: 'none',
      marginRight: '10px',
      backgroundColor: 'var(--input-bg)',
      color: COLORS.text,
    },
    button: {
      padding: '8px 16px',
      borderRadius: '4px',
      border: 'none',
      cursor: 'pointer',
      fontWeight: 'bold',
      backgroundColor: COLORS.accent,
      color: 'var(--accent-text)',
    },
    dangerButton: {
      padding: '8px 16px',
      borderRadius: '4px',
      border: 'none',
      cursor: 'pointer',
      fontWeight: 'bold',
      backgroundColor: 'var(--danger)',
      color: 'var(--accent-text)',
    },
    mutedText: {
      color: COLORS.muted,
      fontSize: '14px',
    }
  };

  return (
    <div style={styles.container}>
      
      {/* Add Friend Section */}
      <div style={styles.section}>
        <h2 style={styles.header}>Add Friend</h2>

        <label style={{ ...styles.mutedText, display: 'block', marginBottom: 6 }}>By username</label>
        <div style={{ display: 'flex', marginBottom: 14 }}>
          <input
            type="text"
            placeholder="Username"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddFriend(); }}
            style={styles.input}
          />
          <button onClick={handleAddFriend} style={styles.button}>Send Request</button>
        </div>

        <label style={{ ...styles.mutedText, display: 'block', marginBottom: 6 }}>By friend code</label>
        <div style={{ display: 'flex' }}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="8-digit code"
            value={codeInput}
            maxLength={8}
            onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddByCode(); }}
            style={styles.input}
          />
          <button onClick={handleAddByCode} style={styles.button}>Add</button>
        </div>

        {actionMessage && (
          <p style={{ marginTop: '10px', color: actionMessage.toLowerCase().includes('fail') || actionMessage.toLowerCase().includes('valid') || actionMessage.toLowerCase().includes('no user') ? 'var(--danger)' : 'var(--success)' }}>
            {actionMessage}
          </p>
        )}

        {me.friendCode && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={styles.mutedText}>Your friend code:</span>
            <code style={{ fontSize: 18, letterSpacing: 2, color: 'var(--text-strong)', fontFamily: 'ui-monospace, Menlo, monospace' }}>{me.friendCode}</code>
            <button onClick={copyMyCode} style={{ ...styles.button, padding: '4px 10px' }}>Copy</button>
          </div>
        )}
      </div>

      {/* Pending Requests Section */}
      <div style={styles.section}>
        <h2 style={styles.header}>Friend Requests</h2>
        
        {/* Incoming */}
        <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Incoming</h3>
        {requests.incoming.length === 0 ? (
          <p style={styles.mutedText}>No incoming requests.</p>
        ) : (
          requests.incoming.map(req => (
            <div key={req.id} style={styles.row}>
              <span>{req.user.username}</span>
              <div>
                <button onClick={() => handleAccept(req.id)} style={{ ...styles.button, marginRight: '5px', backgroundColor: 'var(--success)' }}>Accept</button>
                <button onClick={() => handleDecline(req.id)} style={styles.dangerButton}>Decline</button>
              </div>
            </div>
          ))
        )}

        {/* Outgoing */}
        <h3 style={{ fontSize: '18px', marginTop: '20px', marginBottom: '10px' }}>Outgoing</h3>
        {requests.outgoing.length === 0 ? (
          <p style={styles.mutedText}>No outgoing requests.</p>
        ) : (
          requests.outgoing.map(req => (
            <div key={req.id} style={styles.row}>
              <span>{req.user.username}</span>
              <span style={{ ...styles.mutedText, fontStyle: 'italic' }}>Pending</span>
            </div>
          ))
        )}
      </div>

      {/* Friends Section — click a friend to open the chat with them */}
      <div style={styles.section}>
        <h2 style={styles.header}>Friends — {onlineCount}/{friends.length} online</h2>
        {friends.length === 0 ? (
          <p style={styles.mutedText}>No friends yet. Add someone above to start chatting.</p>
        ) : (
          sortedFriends.map(({ friend, status, online }) => (
            <div
              key={friend.id}
              style={{ ...styles.row, cursor: 'pointer', opacity: online ? 1 : 0.55 }}
              onClick={() => handleOpenDm(friend)}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = COLORS.hover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = COLORS.darkerPanel)}
              title="Open chat"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar user={{ ...friend, status }} size={32} showStatus />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {friend.displayName || friend.username}
                  </div>
                  <div style={styles.mutedText}>@{friend.username}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => handleBlock(friend.id)} style={{ ...styles.button, backgroundColor: 'var(--panel-dark)', color: 'var(--muted)' }}>Block</button>
                <button onClick={() => handleRemoveFriend(friend.id)} style={styles.dangerButton}>Remove</button>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
