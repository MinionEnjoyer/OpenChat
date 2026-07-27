/**
 * ChannelList — categorized channel list with collapse persistence (FR-SRV-004).
 *
 * Groups channels by category. Voice channels show live participant names
 * polled via GET /voice/:channelId/participants on a 15s interval.
 * Collapse state survives remounts via device storage.
 */
import { useState, useEffect, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { api } from '../../stores/session';
import { keys } from '../../sync/keys';
import type { Channel, Category, VoiceParticipant } from '../../api/schema';
import { loadCollapsed, toggleCollapsed, NO_CATEGORY } from './categories';

interface Props {
  serverId: string;
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onEditChannel: (channel: Channel) => void;
  onDeleteChannel: (channel: Channel) => void;
}

interface CategoryGroup {
  categoryName: string;
  categoryId: string;
  channels: Channel[];
}

export function ChannelList({
  serverId,
  channels,
  selectedChannelId,
  onSelectChannel,
  onEditChannel,
  onDeleteChannel,
}: Props): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsed(serverId));

  // Re-load collapse state when server changes
  useEffect(() => {
    setCollapsed(loadCollapsed(serverId));
  }, [serverId]);

  // Fetch categories for grouping
  const categoriesQ = useQuery({
    queryKey: keys.categories(serverId),
    queryFn: () => api.request<Category[]>(`/servers/${serverId}/categories`),
    staleTime: 60_000,
  });

  const categories = categoriesQ.data ?? [];

  // Build category name map
  const categoryNameById = new Map<string, string>();
  for (const c of categories) {
    categoryNameById.set(c.id, c.name);
  }

  // Group channels by category
  const groups: CategoryGroup[] = [];
  const catMap = new Map<string, Channel[]>();

  for (const ch of channels) {
    const key = ch.categoryId ?? NO_CATEGORY;
    if (!catMap.has(key)) {
      catMap.set(key, []);
      const name = ch.categoryId ? (categoryNameById.get(ch.categoryId) ?? ch.categoryId) : strings.channels.categoryDefault;
      groups.push({ categoryName: name, categoryId: key, channels: catMap.get(key)! });
    }
    catMap.get(key)!.push(ch);
  }

  // Sort groups: uncategorized first, then by category position
  groups.sort((a, b) => {
    if (a.categoryId === NO_CATEGORY) return -1;
    if (b.categoryId === NO_CATEGORY) return 1;
    const posA = categories.find((c) => c.id === a.categoryId)?.position ?? 0;
    const posB = categories.find((c) => c.id === b.categoryId)?.position ?? 0;
    return posA - posB;
  });

  const handleToggle = useCallback(
    (categoryId: string) => {
      setCollapsed((prev) => toggleCollapsed(serverId, prev, categoryId));
    },
    [serverId],
  );

  return (
    <View style={styles.root} testID="channel-list">
      {/* Category groups */}
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.categoryId);
        return (
          <View key={group.categoryId} testID={`category-group-${group.categoryId}`}>
            <Pressable
              style={styles.categoryHeader}
              onPress={() => handleToggle(group.categoryId)}
              accessibilityLabel={`${group.categoryName} ${isCollapsed ? 'collapsed' : 'expanded'}`}
              testID={`category-toggle-${group.categoryId}`}
            >
              <Text style={styles.categoryArrow}>{isCollapsed ? '▸' : '▾'}</Text>
              <Text style={styles.categoryName}>{group.categoryName}</Text>
            </Pressable>
            {!isCollapsed && (
              <View>
                {group.channels.map((ch) => (
                  <ChannelRow
                    key={ch.id}
                    channel={ch}
                    isSelected={ch.id === selectedChannelId}
                    onSelect={() => onSelectChannel(ch.id)}
                    onEdit={() => onEditChannel(ch)}
                    onDelete={() => onDeleteChannel(ch)}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}

    </View>
  );
}

// ── Channel row (with voice participant polling) ──

interface ChannelRowProps {
  channel: Channel;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ChannelRow({ channel, isSelected, onSelect, onEdit, onDelete }: ChannelRowProps): React.JSX.Element {
  const isVoice = channel.type === 'VOICE';

  // Poll voice participants every 15s for voice channels only
  const voiceQ = useQuery({
    queryKey: keys.voiceParticipants(channel.id),
    queryFn: () => api.request<VoiceParticipant[]>(`/voice/${channel.id}/participants`),
    enabled: isVoice,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const [showActions, setShowActions] = useState(false);
  const participants = voiceQ.data ?? [];

  const prefix = isVoice ? strings.channels.voicePrefix : strings.shell.channelHash;
  const suffix = isVoice
    ? participants.length > 0
      ? ` ${participants.map((p) => p.displayName ?? p.username).join(', ')}`
      : ` ${strings.channels.noVoiceParticipants}`
    : '';

  return (
    <Pressable
      style={[styles.channelRow, isSelected && styles.channelRowActive]}
      onPress={onSelect}
      onLongPress={() => setShowActions(!showActions)}
      accessibilityLabel={`${prefix} ${channel.name}${suffix}`}
      testID={`channel-${channel.name}`}
    >
      <Text style={styles.channelPrefix}>{prefix}</Text>
      <View style={styles.channelInfo}>
        <Text style={styles.channelName}>{channel.name}</Text>
        {isVoice && participants.length > 0 && (
          <Text style={styles.voiceParticipants}>
            {participants.map((p) => p.displayName ?? p.username).join(', ')}
          </Text>
        )}
      </View>
      {showActions && (
        <View style={styles.channelActions}>
          <Pressable onPress={onEdit} testID={`edit-channel-${channel.name}`}>
            <Text style={styles.channelAction}>{strings.channels.editAction}</Text>
          </Pressable>
          <Pressable onPress={onDelete} testID={`delete-channel-${channel.name}`}>
            <Text style={styles.channelAction}>{strings.channels.deleteAction}</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  categoryArrow: {
    ...typography.caption,
    color: palette.textMuted,
    width: 16,
    marginRight: spacing.xs,
  },
  categoryName: {
    ...typography.caption,
    color: palette.textMuted,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingLeft: spacing.xl,
  },
  channelRowActive: {
    backgroundColor: palette.bgElevated,
  },
  channelPrefix: {
    ...typography.body,
    color: palette.textMuted,
    marginRight: spacing.sm,
    width: 20,
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    ...typography.body,
    color: palette.text,
  },
  voiceParticipants: {
    ...typography.caption,
    color: palette.textMuted,
    marginTop: 2,
  },
  channelActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  channelAction: {
    ...typography.body,
    color: palette.textMuted,
    paddingHorizontal: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.bgElevated,
    marginTop: spacing.sm,
  },
  actionButton: {
    padding: spacing.sm,
    backgroundColor: palette.bgElevated,
    borderRadius: 6,
  },
  actionButtonText: {
    ...typography.body,
    color: palette.textMuted,
    fontWeight: '600',
  },
});
