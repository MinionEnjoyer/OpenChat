import { memo, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Message } from '../lib/types';
import { renderMessageContent } from '../lib/renderMessageContent';
import { Avatar } from './Avatar';
import { Attachment } from './Attachment';
import { Icon } from './Icon';
import { PollView } from './PollView';
import { MessageEmbeds, isSingleEmbedUrl } from './MessageEmbeds';

export interface MessageRowProps {
  message: Message;
  meId: string;
  myUsername: string;
  shareBaseUrl: string;
  mentionNames: Set<string>;
  isEditing: boolean;
  canDelete: boolean;
  canPin: boolean;
  onToggleReaction: (messageId: string, emoji: string, mine: boolean) => void;
  onReply: (m: Message) => void;
  onStartEdit: (m: Message) => void;
  onSaveEdit: (messageId: string, content: string) => void;
  onCancelEdit: () => void;
  onPin: (m: Message, pinned: boolean) => void;
  onDelete: (channelId: string, id: string) => void;
  onPollVote: (optionId: string) => void;
  onOpenReactionPicker: (messageId: string, anchor: { x: number; y: number }) => void;
}

/** Inline edit box; local state so keystrokes don't re-render the whole message list. */
function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <input autoFocus value={value} onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSave(value); }
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={onCancel}
      style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, padding: '6px 8px', outline: 'none', marginTop: 2 }} />
  );
}

/** A single chat message. Memoized so unrelated app re-renders (presence, typing,
 *  unread) don't repaint the message list — only rows whose inputs changed update. */
function MessageRowInner({
  message: m, meId, myUsername, shareBaseUrl, mentionNames, isEditing, canDelete, canPin,
  onToggleReaction, onReply, onStartEdit, onSaveEdit, onCancelEdit, onPin, onDelete, onPollVote, onOpenReactionPicker,
}: MessageRowProps) {
  const showText = !!m.content && m.content !== '​' && !m.poll && !isSingleEmbedUrl(m.content);
  const content = useMemo(
    () => (showText ? renderMessageContent(m.content, mentionNames, myUsername) : null),
    [showText, m.content, mentionNames, myUsername],
  );
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // One source of truth for the message actions — rendered as a hover row on
  // desktop and inside a tapped-open ⋯ tray on mobile.
  const actions: { key: string; label: string; node: ReactNode; danger?: boolean; run: (e: React.MouseEvent) => void }[] = [
    { key: 'react', label: 'Add reaction', node: '😊', run: (e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onOpenReactionPicker(m.id, { x: r.right, y: r.top }); } },
    { key: 'reply', label: 'Reply', node: '↩', run: () => onReply(m) },
  ];
  if (m.authorId === meId) actions.push({ key: 'edit', label: 'Edit', node: '✏️', run: () => onStartEdit(m) });
  if (canPin) actions.push({ key: 'pin', label: m.pinned ? 'Unpin' : 'Pin', node: <Icon name="pin" size={14} />, run: () => onPin(m, !m.pinned) });
  if (canDelete) actions.push({ key: 'delete', label: 'Delete', node: '🗑', danger: true, run: () => onDelete(m.channelId, m.id) });

  return (
    <div id={'msg-' + m.id} className="msg-row" style={{ display: 'flex', gap: 12, position: 'relative', opacity: m.pending ? 0.55 : 1 }}>
      <Avatar user={m.author} size={40} />
      <div style={{ minWidth: 0, flex: 1 }}>
        {m.replyTo && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2, display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ opacity: 0.7 }}>↩</span>
            <span style={{ fontWeight: 600 }}>{m.replyTo.authorName}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{m.replyTo.content}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 'bold', color: 'var(--text-strong)' }}>{m.author?.displayName || m.author?.username || 'user'}</span>
          <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{new Date(m.createdAt).toLocaleTimeString()}</span>
          {m.pending && <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>· sending…</span>}
          {m.failed && <span style={{ fontSize: 11, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="error" size={12} /> failed to send</span>}
          {m.pinned && <span title="Pinned" style={{ fontSize: 11, color: 'var(--muted-2)' }}>· 📌 pinned</span>}
        </div>
        {isEditing ? (
          <EditBox initial={m.content === '​' ? '' : m.content} onSave={(v) => onSaveEdit(m.id, v)} onCancel={onCancelEdit} />
        ) : (
          showText && (
            <p style={{ margin: '2px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {content}
              {m.editedAt && <span style={{ fontSize: 10, color: 'var(--muted-2)', marginLeft: 6 }}>(edited)</span>}
            </p>
          )
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {(m.attachments || []).map((a) => (
            <Attachment key={a.id || a.shareAssetId} attachment={a} shareBaseUrl={shareBaseUrl} />
          ))}
        </div>
        {m.poll && <PollView poll={m.poll} meId={meId} onVote={onPollVote} />}
        {m.content && m.content !== '​' && !m.poll && <MessageEmbeds content={m.content} />}
        {m.reactions.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
            {m.reactions.map((r) => {
              const mine = r.userIds.includes(meId);
              return (
                <button key={r.emoji} onClick={() => onToggleReaction(m.id, r.emoji, mine)}
                  style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '1px 8px', borderRadius: 12, fontSize: 13, cursor: 'pointer',
                    border: '1px solid ' + (mine ? 'var(--accent)' : 'var(--border)'), background: mine ? 'var(--hover)' : 'var(--panel)', color: 'var(--text)' }}>
                  <span>{r.emoji}</span><span style={{ fontSize: 11, color: 'var(--muted)' }}>{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {!isEditing && !m.pending && !m.failed && (
        <>
          {/* Desktop: hover-revealed icon row */}
          <div className="msg-del" style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: 4 }}>
            {actions.map((a) => (
              <button key={a.key} title={a.label} onClick={a.run}
                style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: a.danger ? 'var(--danger)' : 'var(--muted)', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 12, display: 'flex', alignItems: 'center' }}>
                {a.node}
              </button>
            ))}
          </div>

          {/* Mobile: single ⋯ trigger that opens an action tray (portaled out of the
              row, whose content-visibility paint-containment would otherwise clip it) */}
          <button className="msg-actions-trigger" title="Message actions"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right, y: r.bottom }); }}
            style={{ position: 'absolute', top: 0, right: 0, background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 4, cursor: 'pointer', padding: '2px 9px', fontSize: 15, lineHeight: 1, alignItems: 'center' }}>⋯</button>
          {menu && createPortal(
            <>
              <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 300 }} />
              <div style={{ position: 'fixed', zIndex: 301, minWidth: 170,
                left: Math.max(8, Math.min(menu.x - 170, window.innerWidth - 178)),
                top: Math.min(menu.y + 4, window.innerHeight - 8 - 48 * actions.length),
                background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
                {actions.map((a) => (
                  <button key={a.key} onClick={(e) => { a.run(e); setMenu(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 14px', background: 'none', border: 'none', color: a.danger ? 'var(--danger)' : 'var(--text)', cursor: 'pointer', fontSize: 15 }}>
                    <span style={{ width: 18, display: 'inline-flex', justifyContent: 'center' }}>{a.node}</span> {a.label}
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}

export const MessageRow = memo(MessageRowInner);
