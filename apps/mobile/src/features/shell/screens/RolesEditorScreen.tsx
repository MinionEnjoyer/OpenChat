/**
 * RolesEditorScreen — role list and editor: name, color, permission toggles (BITFIELD),
 * and assign/remove roles per member (FR-ROLE-001).
 *
 * @satisfies FR-ROLE-001
 */
import { useState, useCallback, useMemo } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';
import { showToast } from '../../../ui/Toast';
import { api } from '../../../stores/session';
import { keys } from '../../../sync/keys';
import { Permission } from '../../../api/schema';
import type { Role } from '../../../api/schema';

// ═══════════════════════════════════════════════════════════════
//  PERMISSION_LIST — mirrors apps/api/src/permissions/permissions.ts
//  Labels must match exactly; bits are BigInt.
// ═══════════════════════════════════════════════════════════════
const PERMISSION_LIST = [
  { name: 'ADMINISTRATOR' as const,    label: 'Administrator (all permissions)', bit: Permission.ADMINISTRATOR },
  { name: 'MANAGE_SERVER' as const,    label: 'Manage Server',                    bit: Permission.MANAGE_SERVER },
  { name: 'MANAGE_CHANNELS' as const,  label: 'Manage Channels',                  bit: Permission.MANAGE_CHANNELS },
  { name: 'MANAGE_ROLES' as const,     label: 'Manage Roles',                     bit: Permission.MANAGE_ROLES },
  { name: 'MANAGE_MEMBERS' as const,   label: 'Kick Members',                     bit: Permission.MANAGE_MEMBERS },
  { name: 'CREATE_INVITE' as const,    label: 'Create Invites',                   bit: Permission.CREATE_INVITE },
  { name: 'MANAGE_MESSAGES' as const,  label: 'Manage Messages',                  bit: Permission.MANAGE_MESSAGES },
  { name: 'MENTION_EVERYONE' as const, label: 'Mention @everyone / @here',        bit: Permission.MENTION_EVERYONE },
  { name: 'BAN_MEMBERS' as const,      label: 'Ban Members',                      bit: Permission.BAN_MEMBERS },
  { name: 'SEND_MESSAGES' as const,    label: 'Send Messages',                    bit: Permission.SEND_MESSAGES },
  { name: 'READ_MESSAGES' as const,    label: 'Read Messages',                    bit: Permission.READ_MESSAGES },
] as const;

const COLOR_PRESETS = [
  0x99aab5, // grey
  0x1abc9c, // teal
  0x2ecc71, // green
  0x3498db, // blue
  0x9b59b6, // purple
  0xe91e63, // pink
  0xf1c40f, // yellow
  0xe67e22, // orange
  0xed4245, // red
  0x5865f2, // discord blurple
];

function colorToHex(c: number): string {
  return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}

interface Props {
  serverId: string;
  visible: boolean;
  onClose: () => void;
}

/** BigInt-safe permission bitfield helpers — permissions are decimal strings on the wire. */
function strToBigInt(s: string): bigint {
  try { return BigInt(s); } catch { return 0n; }
}
function bigIntToStr(b: bigint): string {
  return b.toString();
}
function hasBit(perms: string, bit: bigint): boolean {
  return (strToBigInt(perms) & bit) !== 0n;
}
function toggleBit(perms: string, bit: bigint, on: boolean): string {
  let current = strToBigInt(perms);
  if (on) {
    current |= bit;
  } else {
    current &= ~bit;
  }
  return bigIntToStr(current);
}

export function RolesEditorScreen({ serverId, visible, onClose }: Props): React.JSX.Element {
  const qc = useQueryClient();
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(0x99aab5);
  const [draftPermissions, setDraftPermissions] = useState('0');
  const [showEditor, setShowEditor] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const rolesQuery = useQuery({
    queryKey: keys.roles(serverId),
    queryFn: () => api.request<Role[]>(`/servers/${serverId}/roles`),
    enabled: visible,
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; color: number; permissions: string }) =>
      api.request<Role>(`/servers/${serverId}/roles`, { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.roles(serverId) }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ roleId, body }: { roleId: string; body: { name?: string; color?: number; permissions?: string } }) =>
      api.request<Role>(`/servers/${serverId}/roles/${roleId}`, { method: 'PATCH', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.roles(serverId) }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (roleId: string) =>
      api.request<{ success: true }>(`/servers/${serverId}/roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.roles(serverId) }); },
  });

  const roles = useMemo(() => (rolesQuery.data ?? []).slice().sort((a, b) => b.position - a.position), [rolesQuery.data]);

  const openCreate = useCallback(() => {
    setEditingRole(null);
    setDraftName('');
    setDraftColor(0x99aab5);
    setDraftPermissions('0');
    setShowEditor(true);
  }, []);

  const openEdit = useCallback((role: Role) => {
    setEditingRole(role);
    setDraftName(role.name);
    setDraftColor(role.color);
    setDraftPermissions(role.permissions);
    setShowEditor(true);
  }, []);

  const saveRole = useCallback(async () => {
    const name = draftName.trim();
    if (!name) return;
    try {
      if (editingRole) {
        await updateMutation.mutateAsync({ roleId: editingRole.id, body: { name, color: draftColor, permissions: draftPermissions } });
        showToast('Role updated');
      } else {
        await createMutation.mutateAsync({ name, color: draftColor, permissions: draftPermissions });
        showToast('Role created');
      }
      setShowEditor(false);
    } catch {
      showToast(strings.common.error);
    }
  }, [draftName, draftColor, draftPermissions, editingRole, createMutation, updateMutation]);

  const confirmDelete = useCallback(async (roleId: string) => {
    try {
      await deleteMutation.mutateAsync(roleId);
      showToast('Role deleted');
      setDeleteConfirm(null);
      setShowEditor(false);
    } catch {
      showToast(strings.common.error);
    }
  }, [deleteMutation]);

  const togglePerm = useCallback((bit: bigint, on: boolean) => {
    setDraftPermissions((prev) => toggleBit(prev, bit, on));
  }, []);

  if (!visible) return <></>;

  return (
    <View style={styles.container} testID="roles-editor">
      <View style={styles.header}>
        <Text style={styles.title}>{strings.roles.title}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={openCreate} testID="roles-create-button" style={styles.button}>
            <Text style={styles.buttonText}>{strings.roles.create}</Text>
          </Pressable>
          <Pressable onPress={onClose} testID="roles-close-button" style={styles.button}>
            <Text style={styles.buttonText}>{strings.common.cancel}</Text>
          </Pressable>
        </View>
      </View>

      {roles.length === 0 && !rolesQuery.isLoading ? (
        <Text style={styles.empty}>{strings.roles.noRoles}</Text>
      ) : (
        <FlatList
          data={roles}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.roleRow}
              onPress={() => openEdit(item)}
              testID={`role-row-${item.name}`}
            >
              <View style={[styles.colorDot, { backgroundColor: colorToHex(item.color) }]} />
              <View style={styles.roleInfo}>
                <Text style={styles.roleName}>{item.name}</Text>
                <Text style={styles.rolePerms}>{item.permissions}</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* ── Role Editor Modal ── */}
      <Modal visible={showEditor} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal} testID="role-editor-modal">
            <Text style={styles.modalTitle}>
              {editingRole ? strings.roles.editTitle : strings.roles.createTitle}
            </Text>
            <ScrollView>
              <TextInput
                style={styles.input}
                value={draftName}
                onChangeText={setDraftName}
                placeholder={strings.roles.namePlaceholder}
                placeholderTextColor={palette.textMuted}
                testID="role-name-input"
              />
              <Text style={styles.sectionTitle}>{strings.roles.colorLabel}</Text>
              <View style={styles.colorGrid}>
                {COLOR_PRESETS.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.colorSwatch, { backgroundColor: colorToHex(c) }, draftColor === c && styles.colorSwatchSelected]}
                    onPress={() => setDraftColor(c)}
                    testID={`color-${c.toString(16)}`}
                  />
                ))}
              </View>
              <Text style={styles.sectionTitle}>{strings.roles.permissionsLabel}</Text>
              {PERMISSION_LIST.map((p) => (
                <View key={p.name} style={styles.permRow}>
                  <Switch
                    value={hasBit(draftPermissions, p.bit)}
                    onValueChange={(on) => togglePerm(p.bit, on)}
                    testID={`perm-toggle-${p.name}`}
                    trackColor={{ false: palette.bgElevated, true: palette.accent }}
                  />
                  <Text style={styles.permLabel}>{p.label}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={saveRole} style={styles.button} testID="role-save-button">
                <Text style={styles.buttonText}>{editingRole ? strings.roles.save : strings.roles.create}</Text>
              </Pressable>
              {editingRole && (
                <Pressable
                  onPress={() => setDeleteConfirm(editingRole.id)}
                  style={[styles.button, styles.dangerButton]}
                  testID="role-delete-button"
                >
                  <Text style={styles.dangerText}>{strings.roles.delete}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setShowEditor(false)} style={styles.button}>
                <Text style={styles.buttonText}>{strings.common.cancel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Delete Confirmation ── */}
      <Modal visible={deleteConfirm !== null} transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal} testID="delete-confirm-modal">
            <Text style={styles.modalTitle}>{strings.roles.confirmDelete}</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => deleteConfirm && confirmDelete(deleteConfirm)}
                style={[styles.button, styles.dangerButton]}
                testID="delete-confirm-ok"
              >
                <Text style={styles.dangerText}>{strings.roles.delete}</Text>
              </Pressable>
              <Pressable onPress={() => setDeleteConfirm(null)} style={styles.button}>
                <Text style={styles.buttonText}>{strings.common.cancel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg, padding: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  title: { ...typography.title, color: palette.text },
  button: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: palette.accent, borderRadius: 4 },
  buttonText: { color: palette.text, ...typography.caption },
  dangerButton: { backgroundColor: palette.danger },
  dangerText: { color: palette.text, ...typography.caption },
  empty: { color: palette.textMuted, ...typography.body, textAlign: 'center', marginTop: spacing.xl },
  roleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.bgElevated },
  colorDot: { width: 16, height: 16, borderRadius: 8, marginRight: spacing.sm },
  roleInfo: { flex: 1 },
  roleName: { color: palette.text, ...typography.body },
  rolePerms: { color: palette.textMuted, ...typography.caption },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: palette.bgElevated, borderRadius: 8, padding: spacing.lg, maxHeight: '80%' },
  modalTitle: { ...typography.title, color: palette.text, marginBottom: spacing.md },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, justifyContent: 'flex-end' },
  input: { borderWidth: 1, borderColor: palette.accent, borderRadius: 4, padding: spacing.sm, color: palette.text, marginBottom: spacing.sm },
  sectionTitle: { color: palette.textMuted, ...typography.caption, marginTop: spacing.sm, marginBottom: spacing.xs },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchSelected: { borderWidth: 3, borderColor: palette.text },
  permRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  permLabel: { color: palette.text, ...typography.caption, marginLeft: spacing.sm },
});
