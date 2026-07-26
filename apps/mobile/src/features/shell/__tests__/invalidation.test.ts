/**
 * Invalidation tests for role CRUD mutations (RolesEditorScreen.tsx).
 *
 * Exercises the REAL hooks extracted from RolesEditorScreen.
 * Mocking only the network boundary (api.request).
 *
 * READ side (the oracle):
 *   Role list: ShellScreen.tsx:168    → useQuery({ queryKey: ['roles', serverId], ... })
 *   Role list: RolesEditorScreen.tsx:103 → useQuery({ queryKey: keys.roles(serverId), ... })
 *
 * NOTE: ShellScreen.tsx:168 uses an INLINE key ['roles', serverId], NOT
 * keys.roles(serverId).  The mutations in RolesEditorScreen use
 * keys.roles(serverId).  Both resolve to the same value today, but
 * if keys.roles ever changes shape without updating ShellScreen, the
 * invalidation target would silently drift.  This test uses
 * keys.roles(serverId) as the canonical read key per the keys module.
 */
import { useCreateRole, useUpdateRole, useDeleteRole } from '../screens/RolesEditorScreen';
import { api } from '../../../stores/session';
import { keys } from '../../../sync/keys';
import { runInvalidationTest } from '../../../__tests__/mutationInvalidationHelper';
import type { Role } from '../../../api/schema';

jest.mock('../../../stores/session', () => ({
  api: { request: jest.fn() },
  useSession: { getState: jest.fn().mockReturnValue({ status: 'signedIn', user: null }) },
}));

const SERVER_ID = 'srv-roles-test';
const READ_KEY = keys.roles(SERVER_ID); // canonical key from RolesEditorScreen.tsx:103

describe('role mutation invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CREATE ROLE — must invalidate keys.roles(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'role-new', serverId: SERVER_ID, name: 'Mod', color: 0x3498db,
      permissions: '8', position: 1,
    } as Role);

    const result = await runInvalidationTest(
      'useCreateRole',
      () => useCreateRole(SERVER_ID),
      { name: 'Mod', color: 0x3498db, permissions: '8' },
      READ_KEY,
    );

    expect(result.invalidated).toBe(true);
  });

  it('UPDATE ROLE — must invalidate keys.roles(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'role-1', serverId: SERVER_ID, name: 'Admin', color: 0xed4245,
      permissions: '255', position: 0,
    } as Role);

    const result = await runInvalidationTest(
      'useUpdateRole',
      () => useUpdateRole(SERVER_ID),
      { roleId: 'role-1', body: { name: 'Admin' } },
      READ_KEY,
    );

    expect(result.invalidated).toBe(true);
  });

  it('DELETE ROLE — must invalidate keys.roles(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({ success: true } as const);

    const result = await runInvalidationTest(
      'useDeleteRole',
      () => useDeleteRole(SERVER_ID),
      'role-to-delete',
      READ_KEY,
    );

    expect(result.invalidated).toBe(true);
  });

  it('DRIFT WARNING: ShellScreen uses inline [\'roles\', serverId], not keys.roles()', () => {
    // ShellScreen.tsx:168 uses: queryKey: ['roles', serverId]
    // Instead of:            queryKey: keys.roles(serverId)
    // Today these resolve identically. If keys.roles ever changes,
    // mutations invalidate the new key while ShellScreen reads the old one.
    expect(['roles', SERVER_ID]).toEqual(keys.roles(SERVER_ID));
  });
});
