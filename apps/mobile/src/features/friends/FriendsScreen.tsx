/**
 * FR-SOC-001 — Friends screen with tabs (Online / All / Pending / Blocked).
 *
 * Backend endpoints (from apps/api/src/friends/):
 *   GET    /friends              → accepted friends list
 *   GET    /friends/requests     → {incoming, outgoing}
 *   GET    /friends/blocked      → blocked users list
 *   POST   /friends/requests     → send request {username?, friendCode?}
 *   POST   /friends/requests/:id/accept
 *   POST   /friends/requests/:id/decline
 *   DELETE /friends/:userId      → remove friend
 *   POST   /friends/block/:userId
 *   POST   /friends/unblock/:userId
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { showToast } from '../../ui/Toast';
import { api } from '../../stores/session';
import type { User } from '../../api/schema';

type Tab = 'online' | 'all' | 'pending' | 'blocked';

interface FriendRequest {
  id: string;
  user: User;
}

interface PendingData {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export function FriendsScreen({ visible, onClose }: { visible: boolean; onClose: () => void }): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('online');
  const [addVisible, setAddVisible] = useState(false);
  const [addInput, setAddInput] = useState('');
  const qc = useQueryClient();

  const friends = useQuery<User[]>({
    queryKey: ['friends'],
    enabled: visible,
    queryFn: () => api.request<User[]>('/friends'),
  });

  const requests = useQuery<PendingData>({
    queryKey: ['friends', 'requests'],
    enabled: visible,
    queryFn: () => api.request<PendingData>('/friends/requests'),
  });

  const blocked = useQuery<User[]>({
    queryKey: ['friends', 'blocked'],
    enabled: visible,
    queryFn: () => api.request<User[]>('/friends/blocked'),
  });

  useEffect(() => {
    if (!visible) {
      setTab('online');
      setAddVisible(false);
      setAddInput('');
    }
  }, [visible]);

  // Refresh on first open
  useEffect(() => {
    if (visible) {
      void friends.refetch();
      void requests.refetch();
      void blocked.refetch();
    }
  }, [visible, blocked, friends, requests]);

  const onlineFriends = useMemo(
    () => (friends.data ?? []).filter((u) => u.status === 'ONLINE'),
    [friends.data],
  );

  const handleAdd = useCallback(async () => {
    const trimmed = addInput.trim();
    if (!trimmed) return;
    try {
      // Detect friend code (8 digits) vs username
      const body = /^\d{8}$/.test(trimmed)
        ? { friendCode: trimmed }
        : { username: trimmed };
      await api.request('/friends/requests', { method: 'POST', body });
      showToast(strings.friends.addSent);
      setAddInput('');
      setAddVisible(false);
      void requests.refetch();
    } catch {
      showToast(strings.friends.addFailed);
    }
  }, [addInput, requests]);

  const handleAccept = useCallback(async (id: string) => {
    try {
      await api.request(`/friends/requests/${id}/accept`, { method: 'POST' });
      showToast(strings.friends.acceptOk);
      void qc.invalidateQueries({ queryKey: ['friends'] });
      void requests.refetch();
    } catch {
      showToast(strings.friends.acceptFailed);
    }
  }, [qc, requests]);

  const handleDecline = useCallback(async (id: string) => {
    try {
      await api.request(`/friends/requests/${id}/decline`, { method: 'POST' });
      showToast(strings.friends.declineOk);
      void requests.refetch();
    } catch {
      showToast(strings.friends.declineFailed);
    }
  }, [requests]);

  const handleCancelRequest = useCallback(async (id: string) => {
    try {
      await api.request(`/friends/requests/${id}/decline`, { method: 'POST' });
      showToast(strings.friends.cancelRequest);
      void requests.refetch();
    } catch {
      showToast(strings.friends.cancelRequestFailed);
    }
  }, [requests]);

  const handleRemove = useCallback(async (userId: string, username: string) => {
    Alert.alert(strings.friends.removeConfirm, `@${username}`, [
      { text: strings.common.cancel, style: 'cancel' },
      {
        text: strings.friends.remove,
        style: 'destructive',
        onPress: async () => {
          try {
            await api.request(`/friends/${userId}`, { method: 'DELETE' });
            showToast(strings.friends.removeOk);
            void qc.invalidateQueries({ queryKey: ['friends'] });
          } catch {
            showToast(strings.friends.removeFailed);
          }
        },
      },
    ]);
  }, [qc]);

  const handleBlock = useCallback(async (userId: string, username: string) => {
    Alert.alert(strings.friends.blockConfirm, `@${username}`, [
      { text: strings.common.cancel, style: 'cancel' },
      {
        text: strings.friends.block,
        style: 'destructive',
        onPress: async () => {
          try {
            await api.request(`/friends/block/${userId}`, { method: 'POST' });
            showToast(strings.friends.blockOk);
            void qc.invalidateQueries({ queryKey: ['friends'] });
            void blocked.refetch();
          } catch {
            showToast(strings.friends.blockFailed);
          }
        },
      },
    ]);
  }, [blocked, qc]);

  const handleUnblock = useCallback(async (userId: string) => {
    try {
      await api.request(`/friends/unblock/${userId}`, { method: 'POST' });
      showToast(strings.friends.unblockOk);
      void blocked.refetch();
    } catch {
      showToast(strings.friends.unblockFailed);
    }
  }, [blocked]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'online', label: strings.friends.tabOnline },
    { key: 'all', label: strings.friends.tabAll },
    { key: 'pending', label: strings.friends.tabPending },
    { key: 'blocked', label: strings.friends.tabBlocked },
  ];

  const renderTabBar = () => (
    <View style={styles.tabBar} testID="friends-tabs">
      {tabs.map((t) => (
        <Pressable
          key={t.key}
          style={[styles.tab, tab === t.key && styles.tabActive]}
          onPress={() => setTab(t.key)}
          testID={`friends-tab-${t.key}`}
        >
          <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const renderFriendItem = (user: User, actions?: React.ReactNode) => (
    <View key={user.id} style={styles.item} testID={`friend-item-${user.username}`}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>
          {user.displayName ?? user.username}
        </Text>
        <Text style={styles.itemUsername}>{strings.members.usernamePrefix}{user.username}</Text>
      </View>
      {actions}
    </View>
  );

  const renderContent = () => {
    switch (tab) {
      case 'online':
        if (!onlineFriends.length) {
          return <Text style={styles.empty}>{strings.friends.emptyOnline}</Text>;
        }
        return (
          <FlatList
            data={onlineFriends}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) => renderFriendItem(item)}
          />
        );
      case 'all':
        if (!(friends.data ?? []).length) {
          return <Text style={styles.empty}>{strings.friends.emptyAll}</Text>;
        }
        return (
          <FlatList
            data={friends.data ?? []}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) =>
              renderFriendItem(
                item,
                <View style={styles.itemActions}>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => handleRemove(item.id, item.username)}
                    testID={`friend-remove-${item.username}`}
                  >
                    <Text style={styles.actionText}>{strings.friends.remove}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => handleBlock(item.id, item.username)}
                    testID={`friend-block-${item.username}`}
                  >
                    <Text style={styles.actionDangerText}>{strings.friends.block}</Text>
                  </Pressable>
                </View>,
              )
            }
          />
        );
      case 'pending': {
        const incoming = requests.data?.incoming ?? [];
        const outgoing = requests.data?.outgoing ?? [];
        if (!incoming.length && !outgoing.length) {
          return <Text style={styles.empty}>{strings.friends.emptyPending}</Text>;
        }
        const items = [
          ...incoming.map((r) => ({ ...r, direction: 'in' as const })),
          ...outgoing.map((r) => ({ ...r, direction: 'out' as const })),
        ];
        return (
          <FlatList
            data={items}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) =>
              renderFriendItem(
                item.user,
                <View style={styles.itemActions}>
                  {item.direction === 'in' ? (
                    <>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => handleAccept(item.id)}
                        testID={`friend-accept-${item.user.username}`}
                      >
                        <Text style={styles.actionText}>{strings.friends.accept}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => handleDecline(item.id)}
                        testID={`friend-decline-${item.user.username}`}
                      >
                        <Text style={styles.actionDangerText}>{strings.friends.decline}</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => handleCancelRequest(item.id)}
                      testID={`friend-cancel-${item.user.username}`}
                    >
                      <Text style={styles.actionText}>{strings.friends.cancel}</Text>
                    </Pressable>
                  )}
                </View>,
              )
            }
          />
        );
      }
      case 'blocked':
        if (!(blocked.data ?? []).length) {
          return <Text style={styles.empty}>{strings.friends.emptyBlocked}</Text>;
        }
        return (
          <FlatList
            data={blocked.data ?? []}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) =>
              renderFriendItem(
                item,
                <View style={styles.itemActions}>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => handleUnblock(item.id)}
                    testID={`friend-unblock-${item.username}`}
                  >
                    <Text style={styles.actionText}>{strings.friends.unblock}</Text>
                  </Pressable>
                </View>,
              )
            }
          />
        );
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} testID="friends-screen">
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{strings.friends.title}</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => setAddVisible(true)} testID="friends-add-button">
              <Text style={styles.headerAction}>{strings.servers.createButtonNav}</Text>
            </Pressable>
            <Pressable onPress={onClose} testID="friends-close-button">
              <Text style={styles.headerAction}>{strings.messages.closeIcon}</Text>
            </Pressable>
          </View>
        </View>

        {renderTabBar()}
        <View style={styles.content}>{renderContent()}</View>
      </KeyboardAvoidingView>

      {/* Add friend overlay */}
      <Modal
        visible={addVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddVisible(false)}
        testID="friends-add-overlay"
      >
        <Pressable style={styles.scrim} onPress={() => setAddVisible(false)}>
          <View />
        </Pressable>
        <View style={styles.addSheet}>
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
            style={styles.addModalInner}
          >
            <Text style={styles.addTitle}>{strings.friends.addTitle}</Text>
            <TextInput
              style={styles.addInput}
              placeholder={strings.friends.addPlaceholder}
              placeholderTextColor={palette.textMuted}
              value={addInput}
              onChangeText={setAddInput}
              autoCapitalize="none"
              autoCorrect={false}
              testID="friends-add-input"
            />
            <Pressable
              style={[styles.addButton, !addInput.trim() && styles.buttonDisabled]}
              onPress={() => void handleAdd()}
              disabled={!addInput.trim()}
              testID="friends-add-send"
            >
              <Text style={styles.addButtonText}>{strings.friends.addButton}</Text>
            </Pressable>
            <Pressable
              style={styles.addCancel}
              onPress={() => {
                setAddVisible(false);
                setAddInput('');
              }}
              testID="friends-add-cancel"
            >
              <Text style={styles.addCancelText}>{strings.common.cancel}</Text>
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </Modal>  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingTop: Platform.OS === 'android' ? 48 : spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgElevated,
  },
  title: { ...typography.title, color: palette.text, fontSize: 22 },
  headerActions: { flexDirection: 'row', gap: spacing.md },
  headerAction: { ...typography.body, color: palette.accent, fontSize: 22 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: palette.bgElevated,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: palette.accent,
  },
  tabText: { ...typography.caption, color: palette.textMuted },
  tabTextActive: { ...typography.caption, color: palette.text, fontWeight: '700' },
  content: { flex: 1 },
  empty: {
    ...typography.caption,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgElevated,
  },
  itemInfo: { flex: 1 },
  itemName: { ...typography.body, color: palette.text },
  itemUsername: { ...typography.caption, color: palette.textMuted },
  itemActions: { flexDirection: 'row', gap: spacing.xs },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 4,
    backgroundColor: palette.bgElevated,
  },
  actionText: { ...typography.caption, color: palette.accent },
  actionDangerText: { ...typography.caption, color: palette.danger },
  addModalInner: {},
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  addSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: palette.bgElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
  },
  addTitle: {
    ...typography.title,
    color: palette.text,
    fontSize: 22,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  addInput: {
    ...typography.body,
    backgroundColor: palette.bg,
    color: palette.text,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  addButton: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  addButtonText: { ...typography.body, color: palette.text, fontWeight: '700' },
  addCancel: {
    padding: spacing.md,
    alignItems: 'center',
  },
  addCancelText: { ...typography.body, color: palette.textMuted },
});
