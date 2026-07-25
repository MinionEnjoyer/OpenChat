/**
 * DmsList — DM channel list sorted by activity (FR-SOC-002).
 *
 * Fetches GET /dms and renders a flat list of DM conversations.
 * Selecting a DM navigates into the ChatPane for that channel.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { api, useSession } from '../../stores/session';
import type { DmChannelDto } from '../../api/schema';

interface Props {
  selectedDmChannelId: string | null;
  onSelectDm: (channelId: string) => void;
}

/**
 * Format the timestamp for "last activity" display.
 * Returns a short relative string like "2m", "1h", "3d".
 */
export function formatActivity(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function DmsList({ selectedDmChannelId, onSelectDm }: Props): React.JSX.Element {
  const user = useSession((s) => s.user);

  const dms = useQuery({
    queryKey: ['dms'],
    queryFn: () => api.request<DmChannelDto[]>('/dms'),
    staleTime: 5_000,
  });

  const channels = dms.data ?? [];

  return (
    <View style={styles.root} testID="dms-list">
      <Text style={styles.title}>{strings.dms.title}</Text>
      {channels.length === 0 ? (
        <Text style={styles.empty} testID="dms-empty">
          {strings.dms.empty}
        </Text>
      ) : (
        channels.map((ch) => (
          <DmRow
            key={ch.id}
            channel={ch}
            myUserId={user?.id ?? ''}
            isSelected={ch.id === selectedDmChannelId}
            onSelect={() => onSelectDm(ch.id)}
          />
        ))
      )}
    </View>
  );
}

interface DmRowProps {
  channel: DmChannelDto;
  myUserId: string;
  isSelected: boolean;
  onSelect: () => void;
}

function DmRow({ channel, myUserId, isSelected, onSelect }: DmRowProps): React.JSX.Element {
  // Show the OTHER recipient's name(s) — exclude self
  const otherRecipients = channel.recipients.filter((r) => r.id !== myUserId);
  const name = otherRecipients
    .map((r) => r.displayName ?? r.username)
    .join(', ');
  const atSign = channel.type === 'DM' ? strings.dms.atSign : '@@';
  const activity = formatActivity(channel.lastMessageAt);

  return (
    <Pressable
      style={[styles.row, isSelected && styles.rowActive]}
      onPress={onSelect}
      accessibilityLabel={`${atSign} ${name}`}
      testID={`dm-${channel.id}`}
    >
      <Text style={styles.atSign}>{atSign}</Text>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {activity !== '' && (
        <Text style={styles.activity}>{activity}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: spacing.sm,
  },
  title: {
    ...typography.caption,
    color: palette.textMuted,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  empty: {
    ...typography.body,
    color: palette.textMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 4,
    marginHorizontal: spacing.xs,
  },
  rowActive: {
    backgroundColor: palette.bgElevated,
  },
  atSign: {
    ...typography.body,
    color: palette.textMuted,
    marginRight: spacing.xs,
    width: 20,
  },
  info: {
    flex: 1,
  },
  name: {
    ...typography.body,
    color: palette.text,
  },
  activity: {
    ...typography.caption,
    color: palette.textMuted,
    marginLeft: spacing.xs,
  },
});
