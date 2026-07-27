/**
 * FR-ROLE-001 — Member role toggle UI (MemberProfileSheet).
 *
 * Source-text verification that:
 *  1. Role toggles section renders with `member-role-toggles` testID
 *  2. Each role renders a Switch with testID `role-toggle-<name>`
 *  3. Toggles are gated on canManageRoles && !isSelf
 *
 * @satisfies FR-ROLE-001
 */
import * as fs from 'fs';

const SRC = fs.readFileSync(
  'src/features/shell/MemberProfileSheet.tsx',
  'utf-8',
);

describe('MemberProfileSheet role toggle source structure (FR-ROLE-001)', () => {
  it('renders role toggles ScrollView with testID member-role-toggles', () => {
    expect(SRC).toContain('member-role-toggles');
  });

  it('renders Switch with testID role-toggle-<name> per role', () => {
    expect(SRC).toContain('testID={`role-toggle-${role.name}`}');
  });

  it('gates role toggles on canManageRoles && !isSelf', () => {
    // The roles section must only render when both canManageRoles and !isSelf are true
    expect(SRC).toContain('canManageRoles && !isSelf && roles.length > 0');
  });

  it('toggles use onToggleRole callback with (role.id, on)', () => {
    expect(SRC).toContain('onToggleRole?.(role.id, on)');
  });

  it('initial toggle state derived from member.roleIds Set', () => {
    expect(SRC).toContain('memberRoleIds.has(role.id)');
  });
});
