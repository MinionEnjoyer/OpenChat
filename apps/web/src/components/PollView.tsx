import type { Poll } from '../lib/types';

/** Renders a poll card inside a message: question, per-option result bars, click to vote. */
export function PollView({ poll, meId, onVote }: { poll: Poll; meId: string; onVote: (optionId: string) => void }) {
  const voters = new Set(poll.options.flatMap((o) => o.voterIds));
  const totalVoters = voters.size;
  const closed = !!poll.closesAt && new Date(poll.closesAt).getTime() < Date.now();

  return (
    <div style={{ maxWidth: 460, border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--panel)', marginTop: 6 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-strong)', marginBottom: 10, wordBreak: 'break-word' }}>{poll.question}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {poll.options.map((o) => {
          const count = o.voterIds.length;
          const mine = o.voterIds.includes(meId);
          const pct = totalVoters ? Math.round((count / totalVoters) * 100) : 0;
          return (
            <button
              key={o.id}
              disabled={closed}
              onClick={() => onVote(o.id)}
              title={closed ? 'Poll closed' : mine ? 'Remove your vote' : 'Vote'}
              style={{
                position: 'relative', textAlign: 'left', width: '100%',
                border: '1px solid ' + (mine ? 'var(--accent)' : 'var(--border)'),
                background: 'var(--input-bg)', borderRadius: 8, padding: '9px 11px',
                cursor: closed ? 'default' : 'pointer', overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct + '%', background: 'var(--accent)', opacity: mine ? 0.3 : 0.16, transition: 'width .35s ease' }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span style={{ color: 'var(--text)', fontWeight: mine ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mine ? '✓ ' : ''}{o.text}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 12, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{pct}% · {count}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 9, fontSize: 12, color: 'var(--muted-2)', display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span>{totalVoters} vote{totalVoters === 1 ? '' : 's'}{poll.multiple ? ' · pick multiple' : ''}</span>
        {poll.closesAt && <span>{closed ? 'Poll closed' : `Closes ${new Date(poll.closesAt).toLocaleString()}`}</span>}
      </div>
    </div>
  );
}
