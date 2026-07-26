import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { buildMemberGroups, type RoleGroup } from '../../domain/members';
import { PresenceDot } from '../presence';
import { MemberProfileSheet } from './MemberProfileSheet';
import type { Member, Role } from '../../api/schema';

interface Props {
  members: Member[];
  roles: Role[];
  myUserId: string;
  myPermissions: string | undefined;
  onKick: (userId: string) => void;
  onLeave: () => void;
}

/**
 * Role-grouped, presence-sorted member list (FR-SRV-007).
 * Renders as a SectionList with role groups as sections.
 * Tapping a member opens the profile sheet (FR-SRV-007).
 * Kick/leave actions gated by permissions (FR-SRV-008).
 */
export function MemberList({
  members,
  roles,
  myUserId,
  myPermissions,
  onKick,
  onLeave,
}: Props): React.JSX.Element {
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const groups: RoleGroup[] = useMemo(
    () => buildMemberGroups(members, roles),
    [members, roles],
  );

  const canKick = useMemo(() => {
    if (!myPermissions) return false;
    try {
      return (BigInt(myPermissions) & (1n << 4n)) !== 0n;
    } catch {
      return false;
    }
  }, [myPermissions]);

  const sections = useMemo(
    () =>
      groups.map((g) => ({
        title: g.roleName,
        color: g.color,
        data: g.members,
      })),
    [groups],
  );

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.userId}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            {section.color !== 0 && (
              <View style={[styles.roleColor, { backgroundColor: intToColor(section.color) }]} />
            )}
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const status = item.user?.status ?? 'OFFLINE';
          const displayName = item.user?.displayName ?? item.user?.username ?? item.userId;
          return (
            <Pressable
              style={styles.memberRow}
              onPress={() => setSelectedMember(item)}
              testID={`member-${item.user?.username ?? item.userId}`}
            >
              <View style={styles.presenceDot}><PresenceDot userId={item.userId} fallback={status} size={8} /></View>
              <Text style={styles.memberName}>{displayName}</Text>
              {item.isOwner && (
                <Text style={styles.crownBadge}>{strings.members.crown}</Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>{strings.members.empty}</Text>
        }
      />
      <MemberProfileSheet
        visible={selectedMember !== null}
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
        canKick={canKick}
        isSelf={selectedMember?.userId === myUserId}
        onKick={selectedMember ? () => onKick(selectedMember.userId) : undefined}
        onLeave={onLeave}
      />
    </View>
  );
}

function intToColor(n: number): string {
  return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  roleColor: {
    width: 6,
    height: 12,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  sectionTitle: {
    ...typography.caption,
    color: palette.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    flex: 1,
  },
  sectionCount: {
    ...typography.caption,
    color: palette.textMuted,
    marginLeft: spacing.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  memberName: {
    ...typography.body,
    color: palette.text,
    flex: 1,
  },
  crownBadge: {
    ...typography.caption,
    color: '#f0b232',
    marginLeft: spacing.xs,
  },
  empty: {
    ...typography.caption,
    color: palette.textMuted,
    textAlign: 'center',
    padding: spacing.lg,
  },
});
