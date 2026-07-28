import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { PresenceDot, presenceLabel } from '../presence';
import type { Member, Role } from '../../api/schema';

interface Props {
  visible: boolean;
  member: Member | null;
  onClose: () => void;
  canKick: boolean;
  isSelf: boolean;
  onKick?: () => void;
  onLeave?: () => void;
  /** All server roles for toggling (FR-ROLE-001). */
  roles: Role[];
  /** Whether current user can manage roles (MANAGE_ROLES permission). */
  canManageRoles: boolean;
  /** Called when a role toggle changes: (roleId, assign). */
  onToggleRole?: (roleId: string, assign: boolean) => void;
}

/**
 * Profile sheet for a server member (FR-SRV-007).
 * Tapped from the member list; shows user info, role toggles (FR-ROLE-001),
 * and actions (kick, leave).
 */
export function MemberProfileSheet({
  visible,
  member,
  onClose,
  canKick,
  isSelf,
  onKick,
  onLeave,
  roles,
  canManageRoles,
  onToggleRole,
}: Props): React.JSX.Element {
  if (!member) return <></>;

  const displayName = member.user?.displayName ?? member.user?.username ?? member.userId;
  const username = member.user?.username ?? '';
  const status = member.user?.status ?? 'OFFLINE';
  const memberRoleIds = new Set(member.roleIds);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View style={styles.sheet} testID="member-profile-sheet">
        <View style={styles.header}>
          <Text style={styles.title}>{displayName}</Text>
          <Pressable onPress={onClose} accessibilityLabel={strings.common.cancel} testID="member-profile-close">
            <Text style={styles.cancelText}>{strings.common.cancel}</Text>
          </Pressable>
        </View>
        <View style={styles.body}>
          {username !== '' && username !== displayName && (
            <Text style={styles.username}>
              {strings.members.usernamePrefix}{username}
            </Text>
          )}
          <View style={styles.statusRow}>
            <PresenceDot userId={member.userId} fallback={status} size={10} />
            <Text style={styles.statusText}>{presenceLabel(status)}</Text>
          </View>
          {member.nickname && (
            <Text style={styles.field}>
              {strings.members.nicknameColon} {member.nickname}
            </Text>
          )}
          {member.isOwner && (
            <Text style={styles.badge}>{strings.members.ownerBadge}</Text>
          )}
        </View>

        {/* Role toggles (FR-ROLE-001) — gated on MANAGE_ROLES permission and not self */}
        {canManageRoles && !isSelf && roles.length > 0 && (
          <View style={styles.rolesSection}>
            <Text style={styles.rolesSectionTitle}>{strings.members.roleLabel}</Text>
            <ScrollView style={styles.rolesScroll} testID="member-role-toggles">
              {roles.map((role) => {
                const hasRole = memberRoleIds.has(role.id);
                return (
                  <View key={role.id} style={styles.roleRow}>
                    <View style={[styles.roleColor, { backgroundColor: colorToHex(role.color) }]} />
                    <Text style={styles.roleName} numberOfLines={1}>{role.name}</Text>
                    <Switch
                      value={hasRole}
                      onValueChange={(on) => onToggleRole?.(role.id, on)}
                      testID={`role-toggle-${role.name}`}
                      trackColor={{ false: palette.bg, true: palette.accent }}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {!isSelf && canKick && onKick && (
          <Pressable
            style={styles.kickButton}
            onPress={() => { onClose(); onKick(); }}
            accessibilityLabel={strings.members.kick}
            testID="member-profile-kick"
          >
            <Text style={styles.kickText}>{strings.members.kick}</Text>
          </Pressable>
        )}
        {isSelf && onLeave && (
          <Pressable
            style={styles.leaveButton}
            onPress={() => { onClose(); onLeave(); }}
            accessibilityLabel={strings.members.leave}
            testID="member-profile-leave"
          >
            <Text style={styles.leaveText}>{strings.members.leave}</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

function colorToHex(c: number): string {
  return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: palette.bgElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: spacing.xl,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.bg,
  },
  title: { ...typography.body, color: palette.text, fontWeight: '700' },
  cancelText: { ...typography.body, color: palette.accent },
  body: { padding: spacing.md },
  username: { ...typography.caption, color: palette.textMuted, marginBottom: spacing.sm },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusText: { ...typography.caption, color: palette.textMuted, marginTop: spacing.xs },
  field: { ...typography.body, color: palette.text, marginBottom: spacing.xs },
  badge: {
    ...typography.caption,
    color: palette.accent,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  rolesSection: {
    borderTopWidth: 1,
    borderTopColor: palette.bg,
    paddingTop: spacing.sm,
  },
  rolesSectionTitle: {
    ...typography.caption,
    color: palette.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  rolesScroll: {
    maxHeight: 200,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  roleColor: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  roleName: {
    ...typography.body,
    color: palette.text,
    flex: 1,
  },
  kickButton: {
    margin: spacing.md,
    padding: spacing.sm,
    backgroundColor: palette.danger,
    borderRadius: 6,
    alignItems: 'center',
  },
  kickText: { ...typography.body, color: palette.text, fontWeight: '700' },
  leaveButton: {
    margin: spacing.md,
    padding: spacing.sm,
    backgroundColor: palette.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.danger,
    alignItems: 'center',
  },
  leaveText: { ...typography.body, color: palette.danger, fontWeight: '700' },
});
