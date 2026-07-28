import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { computeTally, findUserVote, isPollClosed } from '../../domain/polls';
import type { Poll } from '../../api/schema';

interface Props {
  poll: Poll;
  userId: string;
  onVote: (optionId: string) => void;
}

export function PollCard({ poll, userId, onVote }: Props): React.JSX.Element {
  const closed = isPollClosed(poll);
  const tally = computeTally(poll.options);
  const userVote = findUserVote(poll, userId);
  const totalVotes = tally.reduce((s, t) => s + t.count, 0);

  return (
    <View style={styles.card} testID={`poll-${poll.id}`}>
      <Text style={styles.question}>{poll.question}</Text>
      {closed && (
        <Text style={styles.closed} testID={`poll-${poll.id}-closed`}>
          {strings.poll.closed}
        </Text>
      )}
      {tally.map((t) => {
        const isOwn = t.optionId === userVote;
        const pctVal = totalVotes > 0 ? Math.max(t.pct, 2) : 2;
        const barWidth = `${pctVal}${strings.poll.percentSign}` as `${number}%`;
        return (
          <Pressable
            key={t.optionId}
            style={[styles.option, isOwn && styles.optionOwn]}
            onPress={() => !closed && onVote(t.optionId)}
            disabled={closed}
            testID={`poll-${poll.id}-option-${t.optionId}`}
          >
            <View style={styles.optionHeader}>
              <Text style={[styles.optionText, isOwn && styles.optionTextOwn]}>
                {t.text}
              </Text>
              <Text style={[styles.optionPct, isOwn && styles.optionTextOwn]}>
                {t.pct}{strings.poll.percentSign}
              </Text>
            </View>
            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  isOwn ? styles.barFillOwn : styles.barFillDefault,
                  { width: barWidth as DimensionValue },
                ]}
              />
            </View>
            <Text style={styles.optionCount}>
              {t.count}{' '}
              {t.count === 1 ? strings.poll.totalVotes : strings.poll.totalVotesPlural}
            </Text>
          </Pressable>
        );
      })}
      <Text style={styles.total}>
        {totalVotes}{' '}
        {totalVotes === 1 ? strings.poll.totalVotes : strings.poll.totalVotesPlural}
        {' '}{strings.poll.totalLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bgElevated,
    borderRadius: 12,
    padding: spacing.md,
    marginVertical: spacing.xs,
    gap: spacing.sm,
  },
  question: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
  },
  closed: {
    ...typography.caption,
    color: palette.danger,
    fontWeight: '600',
  },
  option: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  optionOwn: {
    backgroundColor: `${palette.accent}18`,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionText: {
    ...typography.body,
    color: palette.text,
    flex: 1,
  },
  optionTextOwn: {
    color: palette.accent,
    fontWeight: '600',
  },
  optionPct: {
    ...typography.caption,
    color: palette.textMuted,
    marginLeft: spacing.sm,
  },
  barBg: {
    height: 6,
    backgroundColor: palette.bg,
    borderRadius: 3,
    marginTop: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  barFillDefault: {
    backgroundColor: palette.textMuted,
  },
  barFillOwn: {
    backgroundColor: palette.accent,
  },
  optionCount: {
    ...typography.caption,
    color: palette.textMuted,
    marginTop: 2,
  },
  total: {
    ...typography.caption,
    color: palette.textMuted,
    textAlign: 'center',
  },
});
