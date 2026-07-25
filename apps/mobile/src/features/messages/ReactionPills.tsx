import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { hasUserReacted } from '../../domain/reactions';
import type { ReactionGroup } from '../../domain/reactions';

interface Props {
  reactions: ReactionGroup[];
  userId: string;
  onToggleReaction: (emoji: string, active: boolean) => void;
  onShowReactors: (emoji: string) => void;
}

export function ReactionPills({
  reactions,
  userId,
  onToggleReaction,
  onShowReactors,
}: Props): React.JSX.Element | null {
  if (!reactions.length) return null;

  return (
    <View style={styles.row}>
      {reactions.map((r) => {
        const active = hasUserReacted([r], userId, r.emoji);
        return (
          <Pressable
            key={r.emoji}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onToggleReaction(r.emoji, active)}
            onLongPress={() => onShowReactors(r.emoji)}
          >
            <Text style={styles.emoji}>{r.emoji}</Text>
            <Text style={[styles.count, active && styles.countActive]}>{r.count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.bg,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillActive: {
    borderColor: palette.accent,
    backgroundColor: `${palette.accent}22`,
  },
  emoji: { fontSize: 16 },
  count: { ...typography.caption, color: palette.textMuted, marginLeft: 4 },
  countActive: { color: palette.accent },
});
