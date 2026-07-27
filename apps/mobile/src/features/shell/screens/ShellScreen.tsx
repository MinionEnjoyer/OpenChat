import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PresenceDot, presenceLabel } from '../../presence';
import { showToast } from '../../../ui/Toast';
import { api, useSession } from '../../../stores/session';
import { useConnection } from '../../../stores/connection';
import { gateway } from '../../../realtime';
import { keys } from '../../../sync/keys';
import { ChatPane, PinsPanel } from '../../messages';
// Reachability: PollCard, PollCreate — rendered transitively via ChatPane (FR-MSG-012)
import { InboxScreen } from '../../inbox';
import type { NotificationsResponse, Server, Channel, Member, Role, User, DmChannelDto } from '../../../api/schema';
import { InvitePreviewOverlay, JoinServerOverlay, InviteCreateOverlay } from '../../invites';
import { parseInviteLink } from '../../../domain/links';
import { DmsList } from '../../dms';
import { MemberList } from '../MemberList';
import { ChannelList } from '../../channels/ChannelList';
import { ChannelForm } from '../../channels/ChannelForm';
import { ChannelReorderScreen } from '../../channels/ChannelReorderScreen';
import { RolesEditorScreen } from './RolesEditorScreen';
import { useCreateChannel, useUpdateChannel, useDeleteChannel } from '../../channels/hooks';
import { storage } from '../../../lib/storageInstance';
import { queryClient } from '../../../sync/queryClient';
import { saveLastChannel, resolveTextChannel } from '../coldstart';
import { setupNotificationTapHandler, type NotificationRoute } from '../../notifications';
import { CreateServerScreen, ServerSettingsScreen } from '../../servers';
import { StatusPicker, type SettableStatus } from '../../presence';
import { AvatarPicker, useAvatarUpload } from '../../avatars';
import { resolveConfig } from '../../../lib/config';
import { NotificationSettingsScreen } from '../../notif-settings';
import { FriendsScreen } from '../../friends';
import { VoicePill, IncomingCallOverlay, VoiceChannelView } from '../../voice';
import { useVoiceConnection } from '../../voice/useVoiceConnection';
import { Permission, hasServerPermission } from '../../../permissions';

type MI = React.ComponentProps<typeof MaterialIcons>['name'];
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
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const updateProfile = useSession((s) => s.updateProfile);
  const connection = useConnection();
  const avatar = useAvatarUpload(resolveConfig().apiBaseUrl);
  const { join: joinVoice, connectionState: voiceConnectionState, activeChannelId: voiceActiveChannelId } = useVoiceConnection(); // FR-VOX-001: join voice channel on tap

  const [selectedDmChannelId, setSelectedDmChannelId] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [pinsVisible, setPinsVisible] = useState(false);
  // Server create / settings overlay state
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [showSettingsServer, setShowSettingsServer] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [settingsServerId, setSettingsServerId] = useState<string | null>(null);

  // FR-SRV-006 — Invite state
  const [invitePreviewCode, setInvitePreviewCode] = useState<string | null>(null);
  const [joinServerVisible, setJoinServerVisible] = useState(false);
  const [inviteCreateVisible, setInviteCreateVisible] = useState(false);
  const [showRolesEditor, setShowRolesEditor] = useState(false);
  const [inboxVisible, setInboxVisible] = useState(false);

  // FR-SOC-001 — Friends screen
  const [friendsVisible, setFriendsVisible] = useState(false);

  // ── Channel management (FR-SRV-004/005) ──
  const [channelFormVisible, setChannelFormVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | undefined>(undefined);
  const [reorderVisible, setReorderVisible] = useState(false);
  // FR-VOX-002: whether the voice channel view is foregrounded (vs text chat)
  const [voiceViewVisible, setVoiceViewVisible] = useState(false);

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

  // FR-SRV-006 — Deep-link listener for openchat://invite/<code>
  useEffect(() => {
    const handleUrl = (event: { url: string }): void => {
      const parsed = parseInviteLink(event.url);
      if (parsed.inviteCode) {
        setInvitePreviewCode(parsed.inviteCode);
      }
    };

    // Handle cold-start deep link
    Linking.getInitialURL()
      .then((url) => {
        if (url) handleUrl({ url });
      })
      .catch(() => {});

    // Handle warm-start deep links (FR-APP-005)
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);
  // FR-NOTIF-002: Notification tap-through → navigate to channel/DM/server
  useEffect(() => {
    const navigate = (route: NotificationRoute): void => {
      if (route.type === 'channel' && route.serverId && route.channelId) {
        setSelectedDmChannelId(null);
        setSelectedServerId(route.serverId);
        setSelectedChannelId(route.channelId);
      } else if (route.type === 'dm' && route.dmChannelId) {
        setSelectedServerId(null);
        setSelectedChannelId(null);
        setSelectedDmChannelId(route.dmChannelId);
      } else if (route.type === 'server' && route.serverId) {
        setSelectedDmChannelId(null);
        setSelectedServerId(route.serverId);
        setSelectedChannelId(null);
      }
    };
    return setupNotificationTapHandler(navigate);
  }, []);

  const isDm = selectedDmChannelId !== null;
  // DD-023: track DM rail entry selection separately so the content column
  // can show DMs list even when no specific DM channel is selected yet.
  const [dmRailActive, setDmRailActive] = useState(false);
  const isDmRailActive = isDm || dmRailActive;

  const dmsQuery = useQuery({
    queryKey: ['dms'],
    queryFn: () => api.request<DmChannelDto[]>('/dms'),
  });

  // ── Servers & channels ──
  const servers = useQuery({
    queryKey: keys.servers,
    queryFn: () => api.request<Server[]>('/servers'),
  });

  const serverId = isDmRailActive ? null : (selectedServerId ?? servers.data?.[0]?.id ?? null);
  const activeServer = servers.data?.find((s) => s.id === serverId) ?? null;

  const channels = useQuery({
    queryKey: keys.channels(serverId ?? 'none'),
    enabled: serverId !== null,
    queryFn: () => api.request<Channel[]>(`/servers/${serverId}/channels`),
  });

  const roles = useQuery({
    queryKey: ['roles', serverId ?? 'none'],
    enabled: serverId !== null && membersQueryEnabled,
    queryFn: () => api.request<Role[]>(`/servers/${serverId}/roles`),
  });

  const members = useQuery({
    queryKey: keys.members(serverId ?? 'none'),
    enabled: serverId !== null && membersQueryEnabled,
    queryFn: () => api.request<Member[]>(`/servers/${serverId}/members`),
  });

  // FR-SOC-005 — notifications badge (lightweight fetch for count)
  const notifications = useQuery({
    queryKey: keys.notifications,
    queryFn: () => api.request<NotificationsResponse>('/notifications'),
    staleTime: 30_000,
  });
  const inboxCount = notifications.data?.count ?? 0;

  // ── Channel CRUD hooks (FR-SRV-005) ──
  const createChannel = useCreateChannel(serverId ?? '');
  const updateChannel = useUpdateChannel(serverId ?? '');
  const deleteChannel = useDeleteChannel(serverId ?? '');
  // ── FR-APP-002: Cold start restore ────────────────────────────────
  //
  // Two-phase: Phase 1 selects the stored server (if different from default).
  // Phase 2 selects the stored channel once channels load for that server.
  // This avoids the stale-data race when the channels query key changes.

  // Phase 1: restore server preference on initial boot.
  useEffect(() => {
    if (!servers.data) return;
    if (selectedServerId !== null) return; // already explicitly chosen
    const pref = storage().getJson<{ serverId: string }>('ui.lastChannel');
    if (!pref) return;
    if (pref.serverId === serverId) return; // already the default
    if (servers.data.some((s) => s.id === pref.serverId)) {
      setSelectedServerId(pref.serverId);
    }
  }, [servers.data, selectedServerId, serverId]);

  // DD-024: auto-select first text channel when opening a server.
  // Stored preference wins; fallback is the first text channel in server order.
  // FR-VOX-002: do NOT fight the voice view — when the voice view is
  // foregrounded, skip auto-select so the user stays in the voice channel.
  useEffect(() => {
    if (selectedChannelId !== null) return; // already have a channel
    if (voiceViewVisible) return; // voice view is foregrounded
    if (!channels.data || channels.data.length === 0) return;
    if (!serverId) return;
    const resolved = resolveTextChannel(storage(), serverId, channels.data);
    if (resolved) setSelectedChannelId(resolved);
  }, [channels.data, selectedChannelId, serverId, voiceViewVisible]);

  // FR-VOX-002: show voice view when connected to a voice channel in this server.
  // Hide it when the voice connection drops.
  useEffect(() => {
    if (voiceConnectionState === 'connected' && voiceActiveChannelId) {
      const isVoiceInServer = (channels.data ?? []).some(
        (c) => c.id === voiceActiveChannelId && c.type === 'VOICE',
      );
      if (isVoiceInServer) {
        setVoiceViewVisible(true);
      }
    } else if (voiceConnectionState === 'idle') {
      setVoiceViewVisible(false);
    }
  }, [voiceConnectionState, voiceActiveChannelId, channels.data]);

  // FR-SRV-010: include ANNOUNCEMENT channels alongside TEXT for chat pane
  const textChannels = (channels.data ?? []).filter((c) => c.type === 'TEXT' || c.type === 'ANNOUNCEMENT');
  const activeChannel = textChannels.find((c) => c.id === selectedChannelId) ?? null;

  // In DM mode, synthesize an active channel from the selected DM
  const activeDmChannel = (isDm && selectedDmChannelId && dmsQuery.data) ? (() => {
    const dm = dmsQuery.data.find((d) => d.id === selectedDmChannelId);
    if (!dm) return null;
    const otherRecipients = dm.recipients.filter((r) => r.id !== user?.id);
    const name = otherRecipients.map((r) => r.displayName ?? r.username).join(', ');
    return { id: dm.id, name, type: dm.type };
  })() : null;

  // Unified active channel for title + ChatPane rendering
  const activeChannelAny: { id: string; name: string } | null =
    activeDmChannel ?? (activeChannel ? { id: activeChannel.id, name: activeChannel.name } : null);
  const handleCreateChannel = useCallback(() => {
    setEditingChannel(undefined);
    setChannelFormVisible(true);
  }, []);

  const handleEditChannel = useCallback((channel: Channel) => {
    setEditingChannel(channel);
    setChannelFormVisible(true);
  }, []);

  const handleDeleteChannel = useCallback(
    (channel: Channel) => {
      const name = channel.name;
      Alert.alert(strings.channels.deleteConfirm, `"${name}"`, [
        { text: strings.common.cancel, style: 'cancel' },
        {
          text: strings.channels.deleteConfirmOk,
          style: 'destructive',
          onPress: () => {
            deleteChannel.mutate(channel.id, {
              onSuccess: () => {
                if (selectedChannelId === channel.id) setSelectedChannelId(null);
              },
            });
          },
        },
      ]);
    },
    [deleteChannel, selectedChannelId],
  );

  const handleChannelFormSubmit = useCallback(
    (data: { name: string; type: 'TEXT' | 'VOICE'; topic?: string | null }) => {
      if (editingChannel) {
        updateChannel.mutate({ channelId: editingChannel.id, ...data });
      } else if (serverId) {
        createChannel.mutate(data);
      }
      setChannelFormVisible(false);
      setEditingChannel(undefined);
    },
    [editingChannel, serverId, createChannel, updateChannel],
  );

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

  // FR-AUTH-007 — Presence status update
  const handleStatusUpdate = useCallback(
    async (status: SettableStatus) => {
      if (statusBusy) return;
      setStatusBusy(true);
      try {
        await updateProfile({ status });
      } catch {
        try {
          const fresh = await api.request<User>('/auth/me');
          useSession.setState({ user: fresh });
        } catch { /* offline — optimistic state stands */ }
      } finally {
        setStatusBusy(false);
      }
    },
    [statusBusy, updateProfile],
  );

  const handleAvatarPick = async (): Promise<void> => {
    const result = await avatar.pickAndUpload();
    if (!result?.thumbnailUrl) return;
    try {
      await updateProfile({ avatarUrl: result.thumbnailUrl } as Parameters<typeof updateProfile>[0]);
      showToast(strings.avatars.avatarSaved);
    } catch {
      showToast(strings.avatars.saveFailed, () => void handleAvatarPick());
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
      // @satisfies FR-VOX-001: voice channels join via LiveKit; text channels select normally.
      const channel = channels.data?.find((c) => c.id === channelId);
      if (channel?.type === 'VOICE') {
        void joinVoice(channelId);
        setVoiceViewVisible(true);
        closeLeft();
        return;
      }
      setSelectedChannelId(channelId);
      setSelectedDmChannelId(null);
      saveLastChannel(storage(), serverId, channelId);
      closeLeft();
    },
    [channels.data, closeLeft, joinVoice, serverId],
  );

  // ── Voice view state ─────────────────────────────────────────────

  /** The voice channel we're currently connected to, if it's in the current server. */
  const voiceChannelInServer = (channels.data ?? []).find(
    (c) => c.id === voiceActiveChannelId && c.type === 'VOICE',
  );
  const showVoiceView =
    voiceViewVisible &&
    voiceConnectionState === 'connected' &&
    voiceChannelInServer != null;

  /** "Show Chat" from voice view: switch to the first text channel without leaving the call. */
  const handleShowChatFromVoice = useCallback(() => {
    setVoiceViewVisible(false);
    if (serverId) {
      const resolved = resolveTextChannel(storage(), serverId, channels.data ?? []);
      if (resolved) setSelectedChannelId(resolved);
    }
  }, [serverId, channels.data]);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
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
            <Text style={styles.topBarAction}>{strings.shell.hamburger}</Text>
          </Pressable>
          <Text style={styles.chatTitle} testID="chat-title" numberOfLines={1}>
            {/* D4: when the voice view is foregrounded, show the voice channel */}
            {showVoiceView && voiceChannelInServer
              ? `${strings.voice.voiceViewHeading}: ${voiceChannelInServer.name}`
              : activeChannelAny
                ? (isDm ? `${strings.dms.atSign} ${activeChannelAny.name}` : `${strings.shell.channelHash} ${activeChannelAny.name}`)
                : strings.shell.selectChannel}
          </Text>
          {activeChannelAny && (
            <Pressable
              onPress={() => setPinsVisible(true)}
              accessibilityLabel={strings.messages.pinsPanelTitle}
              testID="pins-toggle"
            >
              <MaterialIcons name={strings.messages.pinIcon as MI} size={16} color={palette.accent} style={styles.topBarActionIcon} />
            </Pressable>
          )}
          {/* FR-VOX-005: call button in DM top bar */}
          {isDm && activeChannelAny && (
            <CallButton channelId={activeChannelAny.id} />
          )}
          <Pressable onPress={() => setInboxVisible(true)} accessibilityLabel={strings.inbox.title} testID="inbox-button">
            <View style={styles.inboxIconContainer}>
              <MaterialIcons name={strings.inbox.icon as MI} size={16} color={palette.accent} style={styles.topBarActionIcon} />
              {inboxCount > 0 && (
                <View style={styles.inboxBadge} testID="inbox-badge">
                  <Text style={styles.inboxBadgeText}>{inboxCount > 99 ? '99+' : String(inboxCount)}</Text>
                </View>
              )}
            </View>
          </Pressable>
          <Pressable
            onPress={toggleMembers}
            accessibilityLabel={strings.shell.membersTitle}
            testID="members-toggle"
          >
            <Text style={styles.topBarAction}>{strings.shell.membersTitle}</Text>
          </Pressable>
        </View>

        {showVoiceView && voiceChannelInServer ? (
          <VoiceChannelView
            channelName={voiceChannelInServer.name}
            onShowChat={handleShowChatFromVoice}
          />
        ) : activeChannelAny ? (
          <ChatPane channelId={activeChannelAny.id} serverId={serverId} channelType={activeChannel?.type} members={members.data} myPermissions={activeServer?.myPermissions} serverOwnerId={activeServer?.ownerId} onMentionTrigger={() => setMembersQueryEnabled(true)} />
        ) : (
          <View style={styles.chatBody}>
            <Text style={styles.muted} testID="chat-placeholder">
              {strings.shell.chatPlaceholder}
            </Text>
          </View>
        )}
        {/* FR-VOX-001/005: persistent voice-call pill when voice is active but voice view is not foregrounded */}
        {!showVoiceView && <VoicePill />}
      </View>

      {/* Scrim (overlay behind drawers) */}
      <Animated.View
        style={[styles.scrim, scrimStyle]}
        importantForAccessibility={leftOpenJS || rightOpenJS ? 'yes' : 'no-hide-descendants'}
        accessibilityElementsHidden={!(leftOpenJS || rightOpenJS)}
      >
        {(leftOpenJS || rightOpenJS) && (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeBoth}
            testID="drawer-scrim"
          />
        )}
      </Animated.View>

      {/* ── Left drawer (rail + channel list) ── */}
      <Animated.View
        style={[styles.leftDrawer, leftDrawerStyle, { top: insets.top }]}
        testID="left-drawer"
        importantForAccessibility={leftOpenJS ? 'yes' : 'no-hide-descendants'}
        accessibilityElementsHidden={!leftOpenJS}
        pointerEvents={leftOpenJS ? 'auto' : 'none'}
      >
        <GestureDetector gesture={leftDrawerDismiss}>
          <View style={styles.drawerContent}>
            {/* Rail (narrow column) — DD-023: DM entry pinned at top, then servers */}
            <View style={styles.rail} testID="server-rail">
              {/* Top section: DM entry + separator — pinned at top */}
              <View>
                <Pressable
                  style={[styles.railItem, isDmRailActive && styles.railItemActive]}
                  onPress={() => {
                    setDmRailActive(true);
                    setSelectedServerId(null);
                    setSelectedChannelId(null);
                  }}
                  accessibilityLabel={strings.dms.title}
                  testID="rail-dm"
                >
                  <Text style={styles.railItemText}>{strings.dms.atSign}</Text>
                </Pressable>
                {/* Divider between DM entry and server list */}
                <View style={styles.railSeparator}>
                  <View style={styles.railSeparatorLine} />
                </View>
              </View>
              {/* Server list — DD-023: flex:1 so it scrolls within remaining space,
                  never pushes bottom controls off-screen */}
              <FlatList
                data={servers.data ?? []}
                keyExtractor={(s) => s.id}
                style={styles.railServerList}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.railItem, (!isDmRailActive && item.id === serverId) && styles.railItemActive]}
                    onPress={() => {
                      setDmRailActive(false);
                      setSelectedDmChannelId(null);
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
              {/* Bottom section: create-server + friends buttons — pinned at bottom */}
              <View style={{ paddingBottom: insets.bottom }}>
                <Pressable
                  style={styles.railItem}
                  onPress={() => setShowCreateServer(true)}
                  accessibilityLabel={strings.servers.createButton}
                  testID="rail-create-server"
                >
                  <Text style={styles.railItemText}>{strings.servers.createButtonNav}</Text>
                </Pressable>
                {/* FR-SRV-006 — Join server button */}
                <Pressable
                  style={styles.railItem}
                  onPress={() => setJoinServerVisible(true)}
                  accessibilityLabel={strings.invites.joinTitle}
                  testID="rail-join-server"
                >
                  <MaterialIcons name={strings.servers.joinButtonNav as MI} size={16} color={palette.text} />
                </Pressable>
                {/* FR-SOC-001 — Friends button */}
                <Pressable
                  style={styles.railItem}
                  onPress={() => setFriendsVisible(true)}
                  accessibilityLabel={strings.friends.title}
                  testID="rail-friends"
                >
                  <MaterialIcons name={strings.friends.icon as MI} size={16} color={palette.text} />
                </Pressable>
              </View>
            </View>

            {/* Content column — DD-023: DMs or Channels depending on rail selection */}
            <View style={styles.channels} testID="channel-drawer">
              {isDmRailActive ? (
                <View testID="dm-section">
                  <DmsList
                    selectedDmChannelId={selectedDmChannelId}
                    onSelectDm={(dmChannelId) => {
                      setSelectedDmChannelId(dmChannelId);
                      setSelectedChannelId(null);
                      closeLeft();
                    }}
                  />
                </View>
              ) : (
                <>
                  <View style={styles.channelHeader}>
                    <Text style={styles.drawerTitle} testID="channel-drawer-title" numberOfLines={1}>
                      {activeServer?.name ?? strings.shell.channelsFallbackTitle}
                    </Text>
                    {leftOpenJS && activeServer && (
                      <>
                        <Pressable
                          onPress={() => {
                            setSelectedDmChannelId(null);
                            setSettingsServerId(activeServer.id);
                            setShowSettingsServer(true);
                          }}
                          accessibilityLabel={strings.servers.settingsButton}
                          testID="server-settings-button"
                        >
                          <MaterialIcons name={strings.shell.settingsIcon as MI} size={18} color={palette.textMuted} />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setShowNotifSettings(true);
                          }}
                          accessibilityLabel="Notification settings"
                          testID="notif-settings-button"
                          style={{ marginLeft: 8 }}
                        >
                          <MaterialIcons name={strings.shell.notifIcon as MI} size={18} color={palette.textMuted} />
                        </Pressable>
                      </>
                    )}
                  </View>
                  {serverId && (
                    <>
                    <ChannelList
                      serverId={serverId}
                      channels={channels.data ?? []}
                      selectedChannelId={selectedChannelId}
                      onSelectChannel={(channelId) => selectChannel(channelId)}
                      onEditChannel={handleEditChannel}
                      onDeleteChannel={handleDeleteChannel}
                    />
                    {/* Server-action buttons pinned below channel list */}
                    <View style={styles.channelActions}>
                      <Pressable
                        style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                        onPress={handleCreateChannel}
                        accessibilityLabel={strings.channels.createTitle}
                        testID="create-channel-button"
                      >
                        <Text style={styles.actionButtonText}>{strings.channels.createAction}</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                        onPress={() => setReorderVisible(true)}
                        accessibilityLabel={strings.channels.reorderTitle}
                        testID="reorder-channels-button"
                      >
                        <Text style={styles.actionButtonText}>{strings.channels.reorderAction}</Text>
                      </Pressable>
                      {activeServer && hasServerPermission(activeServer.myPermissions, Permission.CREATE_INVITE) && (
                        <Pressable
                          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                          onPress={() => setInviteCreateVisible(true)}
                          accessibilityLabel={strings.invites.createTitle}
                          testID="invite-create-button"
                        >
                          <Text style={styles.actionButtonText}>{strings.invites.createTitle}</Text>
                        </Pressable>
                      )}
                      {activeServer && hasServerPermission(activeServer.myPermissions, Permission.MANAGE_ROLES) && (
                        <Pressable
                          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                          onPress={() => setShowRolesEditor(true)}
                          accessibilityLabel={strings.roles.title}
                          testID="roles-editor-button"
                        >
                          <Text style={styles.actionButtonText}>{strings.roles.title}</Text>
                        </Pressable>
                      )}
                    </View>
                    </>
                  )}
                </>
              )}
            </View>
          </View>
        </GestureDetector>
      </Animated.View>

      {/* ── Right drawer (members + profile) ── */}
      <Animated.View
        style={[styles.rightDrawer, rightDrawerStyle, { top: insets.top }]}
        testID="right-drawer"
        importantForAccessibility={rightOpenJS ? 'yes' : 'no-hide-descendants'}
        accessibilityElementsHidden={!rightOpenJS}
        pointerEvents={rightOpenJS ? 'auto' : 'none'}
      >
        <GestureDetector gesture={rightDrawerDismiss}>
          <View style={styles.drawerContent}>
            <View style={styles.members} testID="members-drawer">
              <Text style={styles.drawerTitle}>{strings.shell.membersTitle}</Text>
              <MemberList
                members={members.data ?? []}
                roles={roles.data ?? []}
                myUserId={user?.id ?? ''}
                myPermissions={activeServer?.myPermissions}
                onKick={async (userId) => {
                  if (!serverId) return;
                  Alert.alert('', strings.members.kickConfirm, [
                    { text: strings.common.cancel, style: 'cancel' },
                    { text: strings.members.kickConfirmOk, style: 'destructive', onPress: async () => {
                      try {
                        await api.request(`/servers/${serverId}/members/${userId}`, { method: 'DELETE' });
                        members.refetch();
                        showToast(`${userId} ${strings.members.kick}`);
                      } catch {
                        showToast(strings.common.error);
                      }
                    } },
                  ]);
                }}
                onLeave={() => {
                  if (!serverId) return;
                  Alert.alert('', strings.members.leaveConfirm, [
                    { text: strings.common.cancel, style: 'cancel' },
                    { text: strings.members.leaveConfirmOk, style: 'destructive', onPress: async () => {
                      try {
                        await api.request(`/servers/${serverId}/members/me`, { method: 'DELETE' });
                        queryClient.invalidateQueries({ queryKey: keys.servers });
                        closeRight();
                        showToast(strings.members.leave);
                      } catch (e: unknown) {
                        showToast((e instanceof Error ? e.message : undefined) ?? strings.common.error);
                      }
                    } },
                  ]);
                }}
              />
              {/* FR-AUTH-007 — Presence status picker */}
              {user && <StatusPicker user={user} onUpdate={handleStatusUpdate} />}

              {/* Avatar picker (FR-MED-020) */}
              <AvatarPicker
                currentUrl={user?.avatarUrl ? (user.avatarUrl.startsWith('/') ? resolveConfig().apiBaseUrl + user.avatarUrl : user.avatarUrl) : null}
                label={strings.avatars.avatarLabel}
                onPick={() => void handleAvatarPick()}
                busy={avatar.busy}
                error={avatar.error}
              />
              {/* Profile box (P1-07) */}
              <View style={styles.profileBox}>
                {/* FR-SOC-004: own status indicator */}
                <View
                  style={styles.statusRow}
                  accessibilityLabel={`${strings.presence.setStatus}: ${presenceLabel(user?.status ?? 'OFFLINE')}`}
                  testID="status-indicator"
                >
                  <PresenceDot
                    userId={user?.id ?? ''}
                    fallback={user?.status ?? 'OFFLINE'}
                    size={10}
                  />
                  <Text style={styles.statusText}>{presenceLabel(user?.status ?? 'OFFLINE')}</Text>
                </View>
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

      {/* ── Server create overlay ── (FR-SRV-002) */}
      {showCreateServer && (
        <View style={styles.overlay}>
          <CreateServerScreen
            onDone={(newServerId) => {
              setShowCreateServer(false);
              if (newServerId) {
                setSelectedServerId(newServerId);
                setSelectedChannelId(null);
              }
            }}
          />
        </View>
      )}

      {/* ── Server settings overlay ── (FR-SRV-003) */}
      {showSettingsServer && settingsServerId && (
        <View style={styles.overlay}>
          {(() => {
            const srv = servers.data?.find((s) => s.id === settingsServerId);
            if (!srv) {
              setShowSettingsServer(false);
              return null;
            }
            return (
              <ServerSettingsScreen
                server={srv}
                onDone={(deleted) => {
                  setShowSettingsServer(false);
                  if (deleted) {
                    setSelectedServerId(null);
                    setSelectedChannelId(null);
                  }
                }}
              />
            );
          })()}
        </View>
      )}

      {/* ── Notification settings overlay ── (FR-NOTIF-003) */}
      {showNotifSettings && (
        <View style={styles.overlay}>
          <NotificationSettingsScreen
            servers={servers.data ?? []}
            channelsByServer={new Map([[serverId ?? '', channels.data ?? []]])}
            onDone={() => setShowNotifSettings(false)}
          />
        </View>
      )}

      {/* Edge gesture zones (invisible strips at screen edges) */}
      <GestureDetector gesture={leftEdgeGesture}>
        <View style={styles.leftEdgeZone} />
      </GestureDetector>
      <GestureDetector gesture={rightEdgeGesture}>
        <View style={styles.rightEdgeZone} />
      </GestureDetector>

      {/* Pins panel (FR-MSG-011) */}
      {activeChannelAny && (
        <PinsPanel
          channelId={activeChannelAny.id}
          visible={pinsVisible}
          onClose={() => setPinsVisible(false)}
        />
      )}

      {/* FR-SRV-006 — Invite preview overlay (deep link + code entry) */}
      {invitePreviewCode !== null && (
        <InvitePreviewOverlay
          code={invitePreviewCode}
          visible={invitePreviewCode !== null}
          onClose={() => setInvitePreviewCode(null)}
          onAccepted={(_serverId) => {
            setInvitePreviewCode(null);
            void servers.refetch();
          }}
        />
      )}

      {/* FR-SRV-006 — Join server overlay (manual code entry) */}
      <JoinServerOverlay
        visible={joinServerVisible}
        onClose={() => setJoinServerVisible(false)}
        onJoined={(_serverId) => {
          void servers.refetch();
        }}
      />

      {/* FR-SRV-006 — Invite create overlay (share sheet) */}
      {activeServer && (
        <InviteCreateOverlay
          serverId={activeServer.id}
          serverName={activeServer.name}
          visible={inviteCreateVisible}
          onClose={() => setInviteCreateVisible(false)}
        />
      )}

      {/* ── Channel form modal (create / edit) ── */}
      <ChannelForm
        visible={channelFormVisible}
        channel={editingChannel}
        onClose={() => {
          setChannelFormVisible(false);
          setEditingChannel(undefined);
        }}
        onSubmit={handleChannelFormSubmit}
      />

      {/* ── Channel reorder modal (FR-SRV-005) ── */}
      {serverId && (
        <ChannelReorderScreen
          visible={reorderVisible}
          serverId={serverId}
          channels={channels.data ?? []}
          onClose={() => setReorderVisible(false)}
        />
      )}

      {/* ── Friends screen (FR-SOC-001) ── */}
      <FriendsScreen
        visible={friendsVisible}
        onClose={() => setFriendsVisible(false)}
      />
      {/* FR-SOC-005 — Notifications inbox */}
      <InboxScreen
        visible={inboxVisible}
        onClose={() => setInboxVisible(false)}
      />

      {/* FR-ROLE-001 — Roles editor overlay (gated on MANAGE_ROLES) */}
      {serverId && (
        <RolesEditorScreen
          serverId={serverId}
          visible={showRolesEditor}
          onClose={() => setShowRolesEditor(false)}
        />
      )}

      {/* FR-VOX-005: full-screen incoming call overlay */}
      <IncomingCallOverlay />

    </KeyboardAvoidingView>
  );
}

/** Call button for DM top bar (FR-VOX-005). */
function CallButton({ channelId }: { channelId: string }): React.JSX.Element {
  const { join, connectionState } = useVoiceConnection();
  const isConnected = connectionState === 'connected' || connectionState === 'joining';
  return (
    <Pressable
      onPress={() => { if (!isConnected) void join(channelId); }}
      accessibilityLabel={strings.voice.callButtonA11y}
      testID="call-button"
      disabled={isConnected}
    >
      <MaterialIcons
        name={strings.voice.iconCall as MI}
        size={20}
        color={isConnected ? palette.textMuted : palette.accent}
        style={styles.topBarActionIcon}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
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
  topBarActionIcon: {
    marginHorizontal: spacing.xs,
  },
  inboxIconContainer: {
    position: 'relative',
  },
  inboxBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: palette.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  inboxBadgeText: {
    ...typography.caption,
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },
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
  railServerList: { flex: 1 },
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
    flexShrink: 1,
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  settingsGlyph: { fontSize: 18, color: palette.textMuted },

  channelActions: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.bgElevated,
    marginTop: spacing.sm,
  },
  actionButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: palette.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.bgElevated,
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButtonText: {
    ...typography.caption,
    color: palette.textMuted,
    fontWeight: '600',
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
  profileBox: { marginTop: 'auto', marginBottom: spacing.sm },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statusText: {
    ...typography.caption,
    color: palette.textMuted,
  },
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

  // ── Full-screen overlay (create / settings) ──
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
  },

  // ── Edge gesture zones ──
  // top: 100 keeps them below the top bar so the hamburger + members
  // buttons are not occluded (P3-T1 fix — edge GestureDetector was
  // intercepting Pressable taps).
  leftEdgeZone: {
    position: 'absolute',
    top: 100,
    left: 0,
    bottom: 0,
    width: EDGE_WIDTH,
    zIndex: 5,
  },
  rightEdgeZone: {
    position: 'absolute',
    top: 100,
    right: 0,
    bottom: 0,
    width: EDGE_WIDTH,
    zIndex: 5,
  },
  // DD-023 — rail separator (between DM entry and server list)
  railSeparator: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    alignItems: 'center',
  },
  railSeparatorLine: {
    width: 32,
    height: 1,
    backgroundColor: palette.bg,
  },
  dmSection: {
    paddingTop: spacing.xs,
  },
});