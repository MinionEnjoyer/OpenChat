/**
 * FR-SOC-005 — Notifications inbox screen.
 *
 * Displays friend requests and server invitations from GET /notifications.
 * Server invitations have accept/decline buttons wired to
 * POST /server-invitations/:id/accept and POST /server-invitations/:id/decline.
 * Friend requests show the requester with a link to the friends feature.
 *
 * @satisfies FR-SOC-005
 */
import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';
import { showToast } from '../../../ui/Toast';
import { api } from '../../../stores/session';
import { keys } from '../../../sync/keys';
import type {
  NotificationsResponse,
  ServerInviteItem,
  FriendRequestItem,
  Server,
} from '../../../api/schema';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Helper: split count into friendRequests vs serverInvites. */
function counts(resp: NotificationsResponse): { frCount: number; siCount: number } {
  return {
    frCount: resp.friendRequests.length,
    siCount: resp.serverInvites.length,
  };
}

/** @satisfies FR-SOC-005 */
export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      api.request<Server>(`/server-invitations/${encodeURIComponent(inviteId)}/accept`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.servers });
      qc.invalidateQueries({ queryKey: keys.notifications });
    },
  });
}

export function useDeclineInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      api.request<{ success: true }>(`/server-invitations/${encodeURIComponent(inviteId)}/decline`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.notifications });
    },
  });
}

function FriendRequestRow({ item }: { item: FriendRequestItem }): React.JSX.Element {
  return (
    <View style={styles.itemRow} testID={`friend-request-${item.id}`}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.user.username}</Text>
        {item.user.displayName ? (
          <Text style={styles.itemSub}>{strings.members.usernamePrefix}{item.user.displayName}</Text>
        ) : null}
      </View>
    </View>
  );
}

function ServerInviteRow({
  item,
  onAccept,
  onDecline,
  acceptingId,
  decliningId,
}: {
  item: ServerInviteItem;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  acceptingId: string | null;
  decliningId: string | null;
}): React.JSX.Element {
  const busy = acceptingId === item.id || decliningId === item.id;
  return (
    <View style={styles.itemRow} testID={`server-invite-${item.id}`}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.server.name}</Text>
        <Text style={styles.itemSub}>
          {strings.inbox.invitationFrom.replace('{username}', item.inviter.username)}
        </Text>
      </View>
      <View style={styles.actions}>
        {busy ? (
          <ActivityIndicator color={palette.accent} style={styles.actionLoader} />
        ) : (
          <>
            <Pressable
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => onAccept(item.id)}
              testID={`accept-invite-${item.id}`}
            >
              <Text style={styles.actionBtnText}>{strings.inbox.accept}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={() => onDecline(item.id)}
              testID={`decline-invite-${item.id}`}
            >
              <Text style={styles.actionBtnText}>{strings.inbox.decline}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

export function InboxScreen({ visible, onClose }: Props): React.JSX.Element {
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  const notifications = useQuery<NotificationsResponse>({
    queryKey: keys.notifications,
    queryFn: () => api.request<NotificationsResponse>('/notifications'),
    enabled: visible,
    refetchOnMount: true,
  });

  const acceptInvite = useAcceptInvite();
  const declineInvite = useDeclineInvite();

  const { frCount, siCount } =
    notifications.data ? counts(notifications.data) : { frCount: 0, siCount: 0 };

  const handleAccept = useCallback(
    async (id: string) => {
      setAcceptingId(id);
      try {
        await acceptInvite.mutateAsync(id);
      } catch {
        showToast(strings.inbox.acceptFailed);
      } finally {
        setAcceptingId(null);
      }
    },
    [acceptInvite],
  );

  const handleDecline = useCallback(
    async (id: string) => {
      setDecliningId(id);
      try {
        await declineInvite.mutateAsync(id);
      } catch {
        showToast(strings.inbox.declineFailed);
      } finally {
        setDecliningId(null);
      }
    },
    [declineInvite],
  );

  const renderItem = useCallback(
    ({ item }: { item: ServerInviteItem }) => (
      <ServerInviteRow
        item={item}
        onAccept={handleAccept}
        onDecline={handleDecline}
        acceptingId={acceptingId}
        decliningId={decliningId}
      />
    ),
    [handleAccept, handleDecline, acceptingId, decliningId],
  );

  const keyExtractor = useCallback((item: ServerInviteItem) => `si-${item.id}`, []);

  const isBusy = acceptingId !== null || decliningId !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="inbox-screen"
    >
      <Pressable style={styles.scrim} onPress={onClose} testID="inbox-scrim">
        <View />
      </Pressable>
      <View style={styles.sheet} testID="inbox-sheet">
        <View style={styles.header}>
          <Text style={styles.title}>{strings.inbox.title}</Text>
          <Pressable onPress={onClose} testID="inbox-close">
            <Text style={styles.closeBtn}>{strings.messages.closeIcon}</Text>
          </Pressable>
        </View>

        {notifications.isLoading ? (
          <ActivityIndicator color={palette.accent} style={styles.loader} />
        ) : frCount + siCount === 0 ? (
          <Text style={styles.emptyText}>{strings.inbox.empty}</Text>
        ) : (
          <>
            {/* Friend Requests section */}
            {frCount > 0 && notifications.data && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {strings.inbox.friendRequests}{strings.inbox.countLabel.replace('{count}', String(frCount))}
                </Text>
                {notifications.data.friendRequests.map((fr) => (
                  <FriendRequestRow key={`fr-${fr.id}`} item={fr} />
                ))}
              </View>
            )}

            {/* Server Invitations section */}
            {siCount > 0 && notifications.data && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {strings.inbox.serverInvites}{strings.inbox.countLabel.replace('{count}', String(siCount))}
                </Text>
                <FlatList
                  data={notifications.data.serverInvites}
                  renderItem={renderItem}
                  keyExtractor={keyExtractor}
                  scrollEnabled={!isBusy}
                  testID="inbox-server-invites-list"
                />
              </View>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    top: '15%',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.bgElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color: palette.text,
    fontSize: 22,
  },
  closeBtn: {
    fontSize: 22,
    color: palette.textMuted,
    padding: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl * 2,
  },
  loader: {
    marginVertical: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.caption,
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.bg,
  },
  itemInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  itemName: {
    ...typography.body,
    color: palette.text,
    fontWeight: '600',
  },
  itemSub: {
    ...typography.caption,
    color: palette.textMuted,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionLoader: {
    width: 24,
    height: 24,
  },
  actionBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
  },
  acceptBtn: {
    backgroundColor: palette.accent,
  },
  declineBtn: {
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.textMuted,
  },
  actionBtnText: {
    ...typography.caption,
    color: palette.text,
    fontWeight: '600',
  },
});
