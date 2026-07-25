import { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { showToast } from '../../ui/Toast';
import { api } from '../../stores/session';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { keys } from '../../sync/keys';
import type { NotificationSetting, Server, Channel } from '../../api/schema';

const MUTE_OPTIONS = [
  { label: strings.notifSettings.mute15m, ms: 15 * 60_000 },
  { label: strings.notifSettings.mute1h, ms: 60 * 60_000 },
  { label: strings.notifSettings.mute8h, ms: 8 * 60 * 60_000 },
  { label: strings.notifSettings.mute24h, ms: 24 * 60 * 60_000 },
  { label: strings.notifSettings.muteForever, ms: null },
] as const;

const LEVELS: NotificationSetting['level'][] = ['ALL', 'MENTIONS', 'NONE'];

function levelLabel(level: NotificationSetting['level']): string {
  switch (level) {
    case 'ALL': return strings.notifSettings.levelAll;
    case 'MENTIONS': return strings.notifSettings.levelMentions;
    case 'NONE': return strings.notifSettings.levelNone;
  }
}

/**
 * FR-NOTIF-003 — Per-server and per-channel notification levels + mute durations.
 * @satisfies FR-NOTIF-003
 */
export function NotificationSettingsScreen({
  servers,
  channelsByServer,
  onDone,
}: {
  servers: Server[];
  channelsByServer: Map<string, Channel[]>;
  onDone: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const [expandedMute, setExpandedMute] = useState<Set<string>>(new Set());

  const settingsQ = useQuery({
    queryKey: keys.notificationSettings,
    queryFn: () => api.request<NotificationSetting[]>('/notifications/settings'),
  });
  const settings = settingsQ.data ?? [];

  const upsertMut = useMutation({
    mutationFn: (input: { scope: 'SERVER' | 'CHANNEL'; scopeId: string; level: string; mutedUntil?: string | null }) =>
      api.request<NotificationSetting>('/notifications/settings', {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.notificationSettings });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (settingId: string) =>
      api.request<{ success: true }>(`/notifications/settings/${settingId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.notificationSettings });
    },
  });

  function getSetting(scope: 'SERVER' | 'CHANNEL', scopeId: string): NotificationSetting | undefined {
    return settings.find((s) => s.scope === scope && s.scopeId === scopeId);
  }

  async function setLevel(scope: 'SERVER' | 'CHANNEL', scopeId: string, level: NotificationSetting['level']): Promise<void> {
    try {
      await upsertMut.mutateAsync({ scope, scopeId, level });
      showToast(strings.notifSettings.saved);
    } catch {
      showToast(strings.notifSettings.saveFailed, () => void setLevel(scope, scopeId, level));
    }
  }

  async function setMute(scope: 'SERVER' | 'CHANNEL', scopeId: string, ms: number | null, currentLevel: NotificationSetting['level']): Promise<void> {
    try {
      const mutedUntil = ms !== null ? new Date(Date.now() + ms).toISOString() : null;
      await upsertMut.mutateAsync({ scope, scopeId, level: currentLevel, mutedUntil });
      showToast(strings.notifSettings.saved);
    } catch {
      showToast(strings.notifSettings.saveFailed);
    }
  }

  async function removeSetting(scope: 'SERVER' | 'CHANNEL', scopeId: string): Promise<void> {
    const s = getSetting(scope, scopeId);
    if (!s) return;
    try {
      await deleteMut.mutateAsync(s.id);
      showToast(strings.notifSettings.saved);
    } catch {
      showToast(strings.notifSettings.saveFailed);
    }
  }

  if (settingsQ.isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={palette.accent} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }


  function toggleMutePicker(key: string): void {
    setExpandedMute((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function renderScopeRow(
    scope: 'SERVER' | 'CHANNEL',
    scopeId: string,
    name: string,
  ): React.JSX.Element {
    const setting = getSetting(scope, scopeId);
    const currentLevel = setting?.level ?? 'ALL';
    const isMuted = setting?.mutedUntil != null;
    const muteKey = `${scope}:${scopeId}`;
    const muteExpanded = expandedMute.has(muteKey);

    return (
      <View key={muteKey} style={styles.row}>
        <Text style={styles.rowName}>{name}</Text>

        <View style={styles.levelRow}>
          {LEVELS.map((level) => (
            <Pressable
              key={level}
              style={[styles.levelPill, currentLevel === level && styles.levelPillActive]}
              onPress={() => void setLevel(scope, scopeId, level)}
              accessibilityLabel={`${name} ${levelLabel(level)}`}
              testID={`notif-level-${scope}-${scopeId}-${level}`}
            >
              <Text style={[styles.levelPillText, currentLevel === level && styles.levelPillTextActive]}>
                {levelLabel(level)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.muteRow}>
          <Pressable
            style={styles.muteToggle}
            onPress={() => toggleMutePicker(muteKey)}
            accessibilityLabel={isMuted ? strings.notifSettings.unmute : strings.notifSettings.mutePlaceholder}
            testID={`notif-mute-toggle-${scope}-${scopeId}`}
          >
            <Text style={styles.muteToggleText}>
              {isMuted ? strings.notifSettings.unmute : strings.notifSettings.mutePlaceholder}
            </Text>
          </Pressable>

          {setting && (
            <Pressable
              style={styles.resetButton}
              onPress={() => void removeSetting(scope, scopeId)}
              testID={`notif-reset-${scope}-${scopeId}`}
            >
              <Text style={styles.resetText}>{strings.notifSettings.reset}</Text>
            </Pressable>
          )}
        </View>

        {muteExpanded && (
          <View style={styles.muteOptions}>
            {MUTE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.label}
                style={styles.muteOption}
                onPress={() => { void setMute(scope, scopeId, opt.ms, currentLevel); toggleMutePicker(muteKey); }}
                testID={`notif-mute-opt-${scope}-${scopeId}-${opt.ms ?? 'forever'}`}
              >
                <Text style={styles.muteOptionText}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>{strings.notifSettings.title}</Text>

      <Text style={styles.sectionLabel}>{strings.notifSettings.serverLabel}</Text>
      {servers.map((s) => renderScopeRow('SERVER', s.id, s.name))}

      <Text style={styles.sectionLabel}>{strings.notifSettings.channelLabel}</Text>
      {Array.from(channelsByServer.entries()).flatMap(([serverId, channels]) =>
        channels.filter((c) => c.type === 'TEXT').map((c) => {
          const server = servers.find((s) => s.id === serverId);
          const label = server ? `${server.name} / ${c.name}` : c.name;
          return renderScopeRow('CHANNEL', c.id, label);
        }),
      )}

      <Pressable style={styles.doneButton} onPress={onDone} testID="notif-settings-done">
        <Text style={styles.doneText}>{strings.common.cancel}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg },
  title: { ...typography.title, color: palette.text, marginBottom: spacing.xl },
  sectionLabel: {
    ...typography.body, color: palette.textMuted, fontWeight: '700',
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  row: {
    backgroundColor: palette.bgElevated, borderRadius: 8,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  rowName: { ...typography.body, color: palette.text, fontWeight: '600', marginBottom: spacing.sm },
  levelRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  levelPill: {
    flex: 1, borderRadius: 6,
    backgroundColor: palette.bg,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  levelPillActive: { backgroundColor: palette.accent },
  levelPillText: { ...typography.caption, color: palette.textMuted },
  levelPillTextActive: { color: palette.text, fontWeight: '700' },
  muteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muteToggle: { flex: 1 },
  muteToggleText: { ...typography.caption, color: palette.accent },
  muteOptions: { marginTop: spacing.sm },
  muteOption: {
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
    backgroundColor: palette.bg, borderRadius: 6, marginBottom: 2,
  },
  muteOptionText: { ...typography.caption, color: palette.text },
  resetButton: { paddingHorizontal: spacing.sm },
  resetText: { ...typography.caption, color: palette.danger },
  doneButton: {
    alignSelf: 'center', marginTop: spacing.xl, padding: spacing.md,
  },
  doneText: { ...typography.body, color: palette.accent },
});
