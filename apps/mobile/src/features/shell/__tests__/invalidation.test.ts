/**
 * Invalidation tests for role CRUD mutations (RolesEditorScreen.tsx).
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
import { keys } from '../../../sync/keys';
import { api } from '../../../stores/session';
import { runInvalidationTest } from '../../../__tests__/mutationInvalidationHelper';
import type { Role } from '../../../api/schema';

jest.mock('../../../stores/session', () => ({
  api: { request: jest.fn() },
  useSession: { getState: jest.fn().mockReturnValue({ status: 'signedIn', user: null }) },
}));

const SERVER_ID = 'srv-roles-test';

describe('role mutation invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CREATE ROLE — must invalidate keys.roles(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'role-new', serverId: SERVER_ID, name: 'Mod', color: 0x3498db,
      permissions: '8', position: 1,
    } as Role);

    const result = await runInvalidationTest((qc) => ({
      label: 'createMutation (roles)',
      mutationFn: (body: unknown) =>
        api.request(`/servers/${SERVER_ID}/roles`, { method: 'POST', body }),
      onSuccess: () => { qc.invalidateQueries({ queryKey: keys.roles(SERVER_ID) }); },
      expectedQueryKey: keys.roles(SERVER_ID),
      input: { name: 'Mod', color: 0x3498db, permissions: '8' },
    }));

    expect(result.invalidated).toBe(true);
  });

  it('UPDATE ROLE — must invalidate keys.roles(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'role-1', serverId: SERVER_ID, name: 'Admin', color: 0xed4245,
      permissions: '255', position: 0,
    } as Role);

    const result = await runInvalidationTest((qc) => ({
      label: 'updateMutation (roles)',
      mutationFn: (input: unknown) => {
        const { roleId, body } = input as { roleId: string; body: Record<string, unknown> };
        return api.request(`/servers/${SERVER_ID}/roles/${roleId}`, { method: 'PATCH', body });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: keys.roles(SERVER_ID) }); },
      expectedQueryKey: keys.roles(SERVER_ID),
      input: { roleId: 'role-1', body: { name: 'Admin' } },
    }));

    expect(result.invalidated).toBe(true);
  });

  it('DELETE ROLE — must invalidate keys.roles(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({ success: true } as const);

    const result = await runInvalidationTest((qc) => ({
      label: 'deleteMutation (roles)',
      mutationFn: (roleId: unknown) =>
        api.request(`/servers/${SERVER_ID}/roles/${roleId}`, { method: 'DELETE' }),
      onSuccess: () => { qc.invalidateQueries({ queryKey: keys.roles(SERVER_ID) }); },
      expectedQueryKey: keys.roles(SERVER_ID),
      input: 'role-to-delete',
    }));

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
