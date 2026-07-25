import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useQuery } from '@tanstack/react-query';
import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';
import { showToast } from '../../../ui/Toast';
import { api, useSession } from '../../../stores/session';
import { useConnection } from '../../../stores/connection';
import { gateway } from '../../../realtime';
import { keys } from '../../../sync/keys';
import { ChatPane } from '../../messages';
import type { Server, Channel, Member } from '../../../api/schema';

Dimensions.get('window'); // keep import for future use
const LEFT_DRAWER_WIDTH = 280;
const RIGHT_DRAWER_WIDTH = 240;
const EDGE_WIDTH = 30; // edge gesture hit-slop for swipe-from-edge
const SPRING_CONFIG = { damping: 30, stiffness: 300 };

/**
 * P3-T1 — Phone drawer layout (DR-005).
 *
 * Replaces the fixed 4-column row with two gesture-driven overlay drawers.
 * Chat pane is full-width; left drawer (rail + channels) and right drawer
 * (members) slide over it. Gestures: left-edge swipe opens left drawer,
 * right-edge swipe opens right drawer; tap scrim closes.
 */
export function ShellScreen(): React.JSX.Element {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const updateProfile = useSession((s) => s.updateProfile);
  const connection = useConnection();

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState('');

  // Drawer state lives in shared values for 60fps gesture tracking.
  const leftOpen = useSharedValue(0); // 0 = closed, 1 = open
  const rightOpen = useSharedValue(0);
  const [leftOpenJS, setLeftOpenJS] = useState(false);
  const [rightOpenJS, setRightOpenJS] = useState(false);

  // Track whether we should fetch members (only when right drawer opens).
  const [membersQueryEnabled, setMembersQueryEnabled] = useState(false);

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
    enabled: serverId !== null && membersQueryEnabled,
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

  // ── Drawer controls ──────────────────────────────────────────────

  const openLeft = useCallback(() => {
    leftOpen.value = withSpring(1, SPRING_CONFIG);
    runOnJS(setLeftOpenJS)(true);
  }, [leftOpen]);

  const closeLeft = useCallback(() => {
    leftOpen.value = withSpring(0, SPRING_CONFIG);
    runOnJS(setLeftOpenJS)(false);
  }, [leftOpen]);

  const openRight = useCallback(() => {
    rightOpen.value = withSpring(1, SPRING_CONFIG);
    runOnJS(setRightOpenJS)(true);
    runOnJS(setMembersQueryEnabled)(true);
  }, [rightOpen]);

  const closeRight = useCallback(() => {
    rightOpen.value = withSpring(0, SPRING_CONFIG);
    runOnJS(setRightOpenJS)(false);
  }, [rightOpen]);

  const closeBoth = useCallback(() => {
    leftOpen.value = withSpring(0, SPRING_CONFIG);
    rightOpen.value = withSpring(0, SPRING_CONFIG);
    runOnJS(setLeftOpenJS)(false);
    runOnJS(setRightOpenJS)(false);
  }, [leftOpen, rightOpen]);

  const toggleLeft = useCallback(() => {
    if (leftOpenJS) {
      closeLeft();
    } else {
      openLeft();
      if (rightOpenJS) closeRight();
    }
  }, [leftOpenJS, rightOpenJS, openLeft, closeLeft, closeRight]);

  const toggleMembers = useCallback(() => {
    if (rightOpenJS) {
      closeRight();
    } else {
      openRight();
      if (leftOpenJS) closeLeft();
    }
  }, [leftOpenJS, rightOpenJS, closeRight, openRight, closeLeft]);

  // ── Gesture handlers ─────────────────────────────────────────────

  // Left-edge swipe → open left drawer
  const leftEdgeGesture = Gesture.Pan()
    .activeOffsetX(10)
    .failOffsetY(10)
    .onEnd((e) => {
      if (e.translationX > 60) {
        runOnJS(openLeft)();
      }
    });

  // Right-edge swipe → open right drawer
  const rightEdgeGesture = Gesture.Pan()
    .activeOffsetX(-10)
    .failOffsetY(10)
    .onEnd((e) => {
      if (e.translationX < -60) {
        runOnJS(openRight)();
      }
    });

  // Left drawer dismiss gesture (swipe left on the open drawer)
  const leftDrawerDismiss = Gesture.Pan()
    .activeOffsetX(-10)
    .onEnd((e) => {
      if (e.translationX < -80) {
        runOnJS(closeLeft)();
      }
    });

  // Right drawer dismiss gesture (swipe right on the open drawer)
  const rightDrawerDismiss = Gesture.Pan()
    .activeOffsetX(10)
    .onEnd((e) => {
      if (e.translationX > 80) {
        runOnJS(closeRight)();
      }
    });

  // ── Animated styles ──────────────────────────────────────────────

  const leftDrawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (leftOpen.value - 1) * LEFT_DRAWER_WIDTH }],
  }));

  const rightDrawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - rightOpen.value) * RIGHT_DRAWER_WIDTH }],
  }));

  const scrimStyle = useAnimatedStyle(() => {
    const opacity = Math.max(leftOpen.value, rightOpen.value) * 0.5;
    // When scrim is invisible, disable touch events so it doesn't block.
    return {
      opacity,
      pointerEvents: opacity > 0.01 ? ('auto' as const) : ('none' as const),
    };
  });

  // ── Channel selection (closes left drawer) ──────────────────────

  const selectChannel = useCallback(
    (channelId: string) => {
      setSelectedChannelId(channelId);
      closeLeft();
    },
    [closeLeft],
  );

  // ── Render ──────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'android' ? -(StatusBar.currentHeight ?? 0) : 0}
      testID="shell-screen"
    >
      {/* Connection banner (FR-APP-003) */}
      {connection.everConnected && connection.state !== 'connected' ? (
        <View style={styles.banner} testID="connection-banner">
          <Text style={styles.bannerText}>
            {connection.state === 'connecting'
              ? strings.connection.connecting
              : strings.connection.offline}
          </Text>
        </View>
      ) : null}

      {/* Full-width chat pane */}
      <View style={styles.chat} testID="chat-pane">
        {/* Top bar with hamburger + title + members button */}
        <View style={styles.topBar}>
          <Pressable
            onPress={toggleLeft}
            accessibilityLabel={strings.shell.channelsFallbackTitle}
            testID="hamburger-button"
            hitSlop={8}
          >
            <Text style={styles.topBarAction}>{strings.shell.hamburgerIcon}</Text>
          </Pressable>
          <Text style={styles.chatTitle} testID="chat-title" numberOfLines={1}>
            {activeChannel
              ? `${strings.shell.channelHash} ${activeChannel.name}`
              : strings.shell.selectChannel}
          </Text>
          <Pressable
            onPress={toggleMembers}
            accessibilityLabel={strings.shell.membersTitle}
            testID="members-toggle"
          >
            <Text style={styles.topBarAction}>{strings.shell.membersTitle}</Text>
          </Pressable>
        </View>

        {activeChannel ? (
          <ChatPane channelId={activeChannel.id} />
        ) : (
          <View style={styles.chatBody}>
            <Text style={styles.muted} testID="chat-placeholder">
              {strings.shell.chatPlaceholder}
            </Text>
          </View>
        )}
      </View>

      {/* Scrim (overlay behind drawers) */}
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeBoth}
          testID="drawer-scrim"
        />
      </Animated.View>

      {/* ── Left drawer (rail + channel list) ── */}
      <Animated.View style={[styles.leftDrawer, leftDrawerStyle]} testID="left-drawer">
        <GestureDetector gesture={leftDrawerDismiss}>
          <View style={styles.drawerContent}>
            {/* Server rail */}
            <View style={styles.rail} testID="server-rail">
              <FlatList
                data={servers.data ?? []}
                keyExtractor={(s) => s.id}
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.railItem,
                      item.id === serverId && styles.railItemActive,
                    ]}
                    onPress={() => {
                      setSelectedServerId(item.id);
                      setSelectedChannelId(null);
                    }}
                    accessibilityLabel={item.name}
                    testID={`rail-server-${item.name}`}
                  >
                    <Text style={styles.railItemText}>
                      {item.name.slice(0, 2).toUpperCase()}
                    </Text>
                  </Pressable>
                )}
              />
            </View>

            {/* Channel list */}
            <View style={styles.channels} testID="channel-drawer">
              <Text style={styles.drawerTitle} testID="channel-drawer-title">
                {activeServer?.name ?? strings.shell.channelsFallbackTitle}
              </Text>
              {textChannels.length === 0 ? (
                <Text style={styles.muted}>
                  {servers.data?.length === 0
                    ? strings.shell.noServers
                    : strings.shell.noChannels}
                </Text>
              ) : (
                <FlatList
                  data={textChannels}
                  keyExtractor={(c) => c.id}
                  renderItem={({ item }) => (
                    <Pressable
                      style={[
                        styles.channelRow,
                        item.id === selectedChannelId && styles.channelRowActive,
                      ]}
                      onPress={() => selectChannel(item.id)}
                      accessibilityLabel={item.name}
                      testID={`channel-${item.name}`}
                    >
                      <Text style={styles.channelHash}>
                        {strings.shell.channelHash}
                      </Text>
                      <Text style={styles.channelName}>{item.name}</Text>
                    </Pressable>
                  )}
                />
              )}
            </View>
          </View>
        </GestureDetector>
      </Animated.View>

      {/* ── Right drawer (members + profile) ── */}
      <Animated.View style={[styles.rightDrawer, rightDrawerStyle]} testID="right-drawer">
        <GestureDetector gesture={rightDrawerDismiss}>
          <View style={styles.drawerContent}>
            <View style={styles.members} testID="members-drawer">
              <Text style={styles.drawerTitle}>{strings.shell.membersTitle}</Text>
              <FlatList
                data={members.data ?? []}
                keyExtractor={(m) => m.userId}
                renderItem={({ item }) => (
                  <Text
                    style={styles.memberRow}
                    testID={`member-${item.user?.username ?? item.userId}`}
                  >
                    {item.user?.displayName ?? item.user?.username ?? item.userId}
                  </Text>
                )}
              />
              {/* Profile box (P1-07) */}
              <View style={styles.profileBox}>
                <Text style={styles.profileLabel}>
                  {strings.profile.displayNameLabel}
                </Text>
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
          </View>
        </GestureDetector>
      </Animated.View>

      {/* Edge gesture zones (invisible strips at screen edges) */}
      <GestureDetector gesture={leftEdgeGesture}>
        <View style={styles.leftEdgeZone} />
      </GestureDetector>
      <GestureDetector gesture={rightEdgeGesture}>
        <View style={styles.rightEdgeZone} />
      </GestureDetector>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  banner: {
    backgroundColor: palette.danger,
    padding: spacing.sm,
    alignItems: 'center',
  },
  bannerText: { ...typography.caption, color: palette.text, fontWeight: '700' },

  // ── Chat pane (full width) ──
  chat: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgElevated,
  },
  chatTitle: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  topBarAction: { ...typography.body, color: palette.accent },
  chatBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typography.caption, color: palette.textMuted },

  // ── Scrim ──
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    zIndex: 10,
  },

  // ── Left drawer ──
  leftDrawer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    left: 0,
    bottom: 0,
    width: LEFT_DRAWER_WIDTH,
    zIndex: 20,
    backgroundColor: palette.bg,
    borderRightWidth: 1,
    borderRightColor: palette.bgElevated,
  },
  // ── Right drawer ──
  rightDrawer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    right: 0,
    bottom: 0,
    width: RIGHT_DRAWER_WIDTH,
    zIndex: 20,
    backgroundColor: palette.bg,
    borderLeftWidth: 1,
    borderLeftColor: palette.bgElevated,
  },
  drawerContent: { flex: 1, flexDirection: 'row' },

  // ── Rail ──
  rail: {
    width: 64,
    backgroundColor: palette.bgElevated,
    paddingTop: spacing.sm,
  },
  railItem: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  railItemActive: { borderRadius: 14, backgroundColor: palette.accent },
  railItemText: { ...typography.body, color: palette.text, fontWeight: '700' },

  // ── Channels ──
  channels: {
    flex: 1,
    backgroundColor: palette.bgElevated,
    padding: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: palette.bg,
  },
  drawerTitle: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  channelRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: 4,
  },
  channelRowActive: { backgroundColor: palette.bg },
  channelHash: {
    ...typography.body,
    color: palette.textMuted,
    marginRight: spacing.xs,
  },
  channelName: { ...typography.body, color: palette.text },

  // ── Members ──
  members: {
    flex: 1,
    backgroundColor: palette.bgElevated,
    padding: spacing.sm,
  },
  memberRow: {
    ...typography.body,
    color: palette.text,
    paddingVertical: spacing.xs,
  },
  profileBox: { marginTop: 'auto' },
  profileLabel: {
    ...typography.caption,
    color: palette.textMuted,
    marginBottom: spacing.xs,
  },
  profileInput: {
    ...typography.body,
    backgroundColor: palette.bg,
    color: palette.text,
    borderRadius: 6,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  profileSave: {
    backgroundColor: palette.accent,
    borderRadius: 6,
    padding: spacing.sm,
    alignItems: 'center',
  },
  profileSaveText: {
    ...typography.caption,
    color: palette.text,
    fontWeight: '700',
  },
  logout: { marginTop: spacing.sm, padding: spacing.sm, alignItems: 'center' },
  logoutText: {
    ...typography.caption,
    color: palette.danger,
    fontWeight: '700',
  },

  // ── Edge gesture zones ──
  leftEdgeZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: EDGE_WIDTH,
    zIndex: 5,
  },
  rightEdgeZone: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: EDGE_WIDTH,
    zIndex: 5,
  },
});