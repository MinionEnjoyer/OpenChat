/** Small "BOT" tag shown next to a bot account's name (messages, member list, profile). */
export function BotBadge() {
  return (
    <span
      style={{
        marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
        background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 4,
        padding: '1px 4px', verticalAlign: 'middle', lineHeight: 1.5, textTransform: 'uppercase',
      }}
    >
      Bot
    </span>
  );
}
