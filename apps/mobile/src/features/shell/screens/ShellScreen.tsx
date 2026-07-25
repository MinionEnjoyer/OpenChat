import { useEffect, useState } from 'react';
import {
  FlatList, Platform, Pressable, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';
import { showToast } from '../../../ui/Toast';
import { api, useSession } from '../../../stores/session';
import { useConnection } from '../../../stores/connection';
import { gateway } from '../../../realtime';
import { keys } from '../../../sync/keys';
import type { Server, Channel, Member } from '../../../api/schema';

/**
 * P1-06 — the Discord-shaped shell (FR-APP-001): server rail · channel drawer ·
 * chat pane (placeholder until Phase 2) · members drawer, plus the connection
 * banner (FR-APP-003) and P1-07 profile editing (FR-AUTH-006) inline in the
 * members surface. Drawers toggle from the top bar; swipe gestures land with
 * the Phase 2 polish pass (BACKLOG).
 */
export function ShellScreen(): React.JSX.Element {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const updateProfile = useSession((s) => s.updateProfile);
  const connection = useConnection();

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');

  useEffect(() => {
    gateway.start();
    return () => gateway.stop();
  }, []);

  const servers = useQuery({
    queryKey: keys.servers,
    queryFn: () => api.request<Server[]>('/servers'),
  });

  const serverId = selectedServerId ?? servers.data?.[0]?.id ?? null;
  const activeServer = servers.data?.find((s) => s.id === serverId) ?? null;

  const channels = useQuery({
    queryKey: keys.channels(serverId ?? 'none'),
    enabled: serverId !== null,
    queryFn: () => api.request<Channel[]>(`/servers/${serverId}/channels`),
  });

  const members = useQuery({
    queryKey: keys.members(serverId ?? 'none'),
    enabled: serverId !== null && membersOpen,
    queryFn: () => api.request<Member[]>(`/servers/${serverId}/members`),
  });

  const textChannels = (channels.data ?? []).filter((c) => c.type === 'TEXT');
  const activeChannel = textChannels.find((c) => c.id === selectedChannelId) ?? null;

  const saveDisplayName = async (): Promise<void> => {
    const draft = displayNameDraft.trim();
    if (!draft) return;
    try {
      await updateProfile({ displayName: draft });
      setDisplayNameDraft('');
      showToast(strings.profile.saved);
    } catch {
      showToast(strings.profile.saveFailed, () => void saveDisplayName());
    }
  };

  return (
    <View style={styles.root} testID="shell-screen">
      {/* FR-APP-003 — connection banner: shown after a drop, cleared on reconnect */}
      {connection.everConnected && connection.state !== 'connected' ? (
        <View style={styles.banner} testID="connection-banner">
          <Text style={styles.bannerText}>
            {connection.state === 'connecting' ? strings.connection.connecting : strings.connection.offline}
          </Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {/* Surface 1 — server rail */}
        <View style={styles.rail} testID="server-rail">
          <FlatList
            data={servers.data ?? []}
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.railItem, item.id === serverId && styles.railItemActive]}
                onPress={() => {
                  setSelectedServerId(item.id);
                  setSelectedChannelId(null);
                }}
                accessibilityLabel={item.name}
                testID={`rail-server-${item.name}`}
              >
                <Text style={styles.railItemText}>{item.name.slice(0, 2).toUpperCase()}</Text>
              </Pressable>
            )}
          />
        </View>

        {/* Surface 2 — channel drawer */}
        <View style={styles.channels} testID="channel-drawer">
          <Text style={styles.drawerTitle} testID="channel-drawer-title">
            {activeServer?.name ?? strings.shell.channelsFallbackTitle}
          </Text>
          {textChannels.length === 0 ? (
            <Text style={styles.muted}>
              {servers.data?.length === 0 ? strings.shell.noServers : strings.shell.noChannels}
            </Text>
          ) : (
            <FlatList
              data={textChannels}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.channelRow, item.id === selectedChannelId && styles.channelRowActive]}
                  onPress={() => setSelectedChannelId(item.id)}
                  accessibilityLabel={item.name}
                  testID={`channel-${item.name}`}
                >
                  <Text style={styles.channelHash}>{strings.shell.channelHash}</Text>
                  <Text style={styles.channelName}>{item.name}</Text>
                </Pressable>
              )}
            />
          )}
        </View>

        {/* Surface 3 — chat pane (placeholder until Phase 2 messaging) */}
        <View style={styles.chat} testID="chat-pane">
          <View style={styles.topBar}>
            <Text style={styles.chatTitle} testID="chat-title">
              {activeChannel ? `${strings.shell.channelHash} ${activeChannel.name}` : strings.shell.selectChannel}
            </Text>
            <Pressable
              onPress={() => setMembersOpen((open) => !open)}
              accessibilityLabel={strings.shell.membersTitle}
              testID="members-toggle"
            >
              <Text style={styles.topBarAction}>{strings.shell.membersTitle}</Text>
            </Pressable>
          </View>
          <View style={styles.chatBody}>
            <Text style={styles.muted} testID="chat-placeholder">
              {strings.shell.chatPlaceholder}
            </Text>
          </View>
        </View>

        {/* Surface 4 — members drawer (+ P1-07 profile basics) */}
        {membersOpen ? (
          <View style={styles.members} testID="members-drawer">
            <Text style={styles.drawerTitle}>{strings.shell.membersTitle}</Text>
            <FlatList
              data={members.data ?? []}
              keyExtractor={(m) => m.userId}
              renderItem={({ item }) => (
                <Text style={styles.memberRow} testID={`member-${item.user?.username ?? item.userId}`}>
                  {item.user?.displayName ?? item.user?.username ?? item.userId}
                </Text>
              )}
            />
            <View style={styles.profileBox}>
              <Text style={styles.profileLabel}>{strings.profile.displayNameLabel}</Text>
              <TextInput
                style={styles.profileInput}
                placeholder={user?.displayName ?? user?.username ?? ''}
                placeholderTextColor={palette.textMuted}
                value={displayNameDraft}
                onChangeText={setDisplayNameDraft}
                accessibilityLabel={strings.profile.displayNameLabel}
                testID="profile-displayname"
              />
              <Pressable
                style={styles.profileSave}
                onPress={() => void saveDisplayName()}
                accessibilityLabel={strings.profile.save}
                testID="profile-save"
              >
                <Text style={styles.profileSaveText}>{strings.profile.save}</Text>
              </Pressable>
              <Pressable
                style={styles.logout}
                onPress={() => void logout()}
                accessibilityLabel={strings.shell.logout}
                testID="logout-button"
              >
                <Text style={styles.logoutText}>{strings.shell.logout}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Android draws under the status bar; pad the shell below it.
  root: { flex: 1, backgroundColor: palette.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  banner: { backgroundColor: palette.danger, padding: spacing.sm, alignItems: 'center' },
  bannerText: { ...typography.caption, color: palette.text, fontWeight: '700' },
  body: { flex: 1, flexDirection: 'row' },
  rail: { width: 64, backgroundColor: palette.bgElevated, paddingTop: spacing.sm },
  railItem: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: palette.bg,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.sm,
  },
  railItemActive: { borderRadius: 14, backgroundColor: palette.accent },
  railItemText: { ...typography.body, color: palette.text, fontWeight: '700' },
  channels: { width: 140, backgroundColor: palette.bgElevated, padding: spacing.sm, borderLeftWidth: 1, borderLeftColor: palette.bg },
  drawerTitle: { ...typography.body, color: palette.text, fontWeight: '700', marginBottom: spacing.sm },
  channelRow: { flexDirection: 'row', paddingVertical: spacing.xs, paddingHorizontal: spacing.xs, borderRadius: 4 },
  channelRowActive: { backgroundColor: palette.bg },
  channelHash: { ...typography.body, color: palette.textMuted, marginRight: spacing.xs },
  channelName: { ...typography.body, color: palette.text },
  chat: { flex: 1 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.bgElevated,
  },
  chatTitle: { ...typography.body, color: palette.text, fontWeight: '700' },
  topBarAction: { ...typography.body, color: palette.accent },
  chatBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typography.caption, color: palette.textMuted },
  members: { width: 160, backgroundColor: palette.bgElevated, padding: spacing.sm },
  memberRow: { ...typography.body, color: palette.text, paddingVertical: spacing.xs },
  profileBox: { marginTop: 'auto' },
  profileLabel: { ...typography.caption, color: palette.textMuted, marginBottom: spacing.xs },
  profileInput: {
    ...typography.body, backgroundColor: palette.bg, color: palette.text,
    borderRadius: 6, padding: spacing.sm, marginBottom: spacing.xs,
  },
  profileSave: { backgroundColor: palette.accent, borderRadius: 6, padding: spacing.sm, alignItems: 'center' },
  profileSaveText: { ...typography.caption, color: palette.text, fontWeight: '700' },
  logout: { marginTop: spacing.sm, padding: spacing.sm, alignItems: 'center' },
  logoutText: { ...typography.caption, color: palette.danger, fontWeight: '700' },
});
