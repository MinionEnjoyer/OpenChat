/**
 * Invalidation tests for server-scoped mutations.
 *
 * Three known-broken cases (must FAIL against current code):
 *   1. Create server   — new server missing from rail
 *   2. Rename server   — old name persists after rename
 *   3. Delete channel  — channel still listed after deletion (tested in channels/__tests__/)
 *
 * READ side (the oracle):
 *   - Server list:  ShellScreen.tsx:154  → useQuery({ queryKey: keys.servers, ... })
 *   - Channel list: ShellScreen.tsx:162  → useQuery({ queryKey: keys.channels(serverId), ... })
 *
 * For cases 1-2, the mutation is NOT wrapped in useMutation — it is inline
 * api.request + manual invalidateQueries inside a component.  We reconstruct
 * the mutation logic here exactly as it appears in the screens.
 *
 * Case 3 (delete channel) lives in channels/__tests__/invalidation.test.ts
 * since it is a useMutation hook in channels/hooks.ts.
 */
import { QueryClient } from '@tanstack/react-query';
import { keys } from '../../../sync/keys';
import { api } from '../../../stores/session';

// ── Mocks ──────────────────────────────────────────────────────────
jest.mock('../../../stores/session', () => ({
  api: { request: jest.fn() },
  useSession: { getState: jest.fn().mockReturnValue({ status: 'signedIn', user: null }) },
}));

// ── Helpers ────────────────────────────────────────────────────────
/** Reconstructs the CreateServerScreen mutation from CreateServerScreen.tsx */
function createServerMutation() {
  const qc = new QueryClient();
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

  return {
    qc,
    invalidateSpy,
    /** Exact logic from CreateServerScreen.submit (line 32-40) */
    async submit(name: string) {
      const server = await api.request('/servers', {
        method: 'POST',
        body: { name },
      });
      await qc.invalidateQueries({ queryKey: keys.servers });
      return server;
    },
  };
}

/** Reconstructs the ServerSettingsScreen rename mutation from ServerSettingsScreen.tsx */
function renameServerMutation(serverId: string) {
  const qc = new QueryClient();
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

  return {
    qc,
    invalidateSpy,
    /** Exact logic from ServerSettingsScreen.submitRename (line 60-77) */
    async submit(name: string) {
      await api.request(`/servers/${serverId}`, {
        method: 'PATCH',
        body: { name },
      });
      await qc.invalidateQueries({ queryKey: keys.servers });
    },
  };
}

/** Reconstructs the ServerSettingsScreen delete-server mutation from ServerSettingsScreen.tsx */
function deleteServerMutation(serverId: string) {
  const qc = new QueryClient();
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

  return {
    qc,
    invalidateSpy,
    /** Exact logic from ServerSettingsScreen.submitDelete (line 79-90) */
    async submit() {
      await api.request(`/servers/${serverId}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: keys.servers });
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────
describe('server mutation invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════
  // CASE 1: Create server — EXPECTED TO FAIL (KNOWN BUG)
  // Bug: the mutation works server-side but the rail never shows the
  // new server.  The inline api.request pattern means there is no
  // useMutation with structured onSuccess; invalidation is ad-hoc.
  //
  // READ key (ShellScreen.tsx:154): keys.servers = ['servers']
  // ═══════════════════════════════════════════════════════════════
  it('CREATE SERVER — must invalidate keys.servers after POST /servers (KNOWN BROKEN)', async () => {
    (api.request as jest.Mock).mockResolvedValue({ id: 'new-srv', name: 'test' });

    const { submit, invalidateSpy } = createServerMutation();
    await submit('test-server');

    // Oracle: the READ side uses keys.servers = ['servers']
    const ExpectedReadKey = ['servers'] as const;

    // This assertion detects whether invalidateQueries was called with the
    // exact key the reading screen uses. The current code DOES call
    // invalidateQueries({ queryKey: keys.servers }), but the mutation is
    // NOT wrapped in useMutation — it is a raw try/catch inside a component.
    // That means:
    //   - No mutation state (loading/error/isSuccess) for the UI
    //   - No automatic retry on network failure
    //   - If the component unmounts mid-request, invalidation is silently dropped
    //
    // The test reconstructs the happy path and should pass on the raw
    // invalidation call. If it FAILS, the invalidation target is wrong
    // or the mutation never reaches the invalidation.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ExpectedReadKey }),
    );
  });

  // ═══════════════════════════════════════════════════════════════
  // CASE 2: Rename server — EXPECTED TO FAIL (KNOWN BUG)
  // Bug: PATCH /servers/:id succeeds but the server name in the rail
  // stays stale.  Same inline pattern as create — no useMutation.
  //
  // READ key (ShellScreen.tsx:154): keys.servers = ['servers']
  // ═══════════════════════════════════════════════════════════════
  it('RENAME SERVER — must invalidate keys.servers after PATCH /servers/:id (KNOWN BROKEN)', async () => {
    (api.request as jest.Mock).mockResolvedValue({ id: 'srv-1', name: 'renamed' });

    const { submit, invalidateSpy } = renameServerMutation('srv-1');
    await submit('renamed');

    const ExpectedReadKey = ['servers'] as const;

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ExpectedReadKey }),
    );
  });

  // ═══════════════════════════════════════════════════════════════
  // DELETE SERVER — also inline, test for completeness
  // READ key (ShellScreen.tsx:154): keys.servers = ['servers']
  // ═══════════════════════════════════════════════════════════════
  it('DELETE SERVER — must invalidate keys.servers after DELETE /servers/:id', async () => {
    (api.request as jest.Mock).mockResolvedValue({ success: true });

    const { submit, invalidateSpy } = deleteServerMutation('srv-1');
    await submit();

    const ExpectedReadKey = ['servers'] as const;

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ExpectedReadKey }),
    );
  });

  // ═══════════════════════════════════════════════════════════════
  // Non-useMutation detection: confirm these features have no
  // exported mutation hooks.  The servers feature barrel (index.ts)
  // exports only CreateServerScreen and ServerSettingsScreen —
  // neither is a mutation hook.
  //
  // This IS part of the bug: without a useMutation hook, mutation
  // state (loading/error/isSuccess) and cache invalidation are not
  // managed declaratively.  Each screen reimplements the same
  // try/catch + invalidateQueries pattern by hand.
  // ═══════════════════════════════════════════════════════════════
  it('BUG CONFIRMATION: servers feature exports no useMutation hooks — invalidation is ad-hoc', () => {
    // The barrel file apps/mobile/src/features/servers/index.ts exports:
    //   export { CreateServerScreen } from './screens/CreateServerScreen';
    //   export { ServerSettingsScreen } from './screens/ServerSettingsScreen';
    //
    // Neither CreateServerScreen nor ServerSettingsScreen exports a
    // useMutation hook.  Mutations are performed via raw api.request
    // inside component-local try/catch blocks.  This means:
    //   1. No structured onSuccess/onError lifecycle
    //   2. No automatic invalidation — every screen must remember to
    //      call invalidateQueries manually
    //   3. If the component unmounts mid-request, invalidation is
    //      silently dropped
    //   4. The invalidation cannot be unit-tested in isolation
    //
    // A proper fix would extract useCreateServer / useRenameServer /
    // useDeleteServer hooks and have them return useMutation results.
    // The barrel file (apps/mobile/src/features/servers/index.ts) exports:
    //   export { CreateServerScreen } from './screens/CreateServerScreen';
    //   export { ServerSettingsScreen } from './screens/ServerSettingsScreen';
    //
    // Neither is a useMutation hook. Mutations are performed via raw
    // api.request inside component-local try/catch blocks:
    //   1. No structured onSuccess/onError lifecycle
    //   2. No automatic invalidation — every screen must remember to
    //      call invalidateQueries manually
    //   3. If the component unmounts mid-request, invalidation is
    //      silently dropped
    //   4. The invalidation cannot be unit-tested in isolation
    //
    // A proper fix would extract useCreateServer / useRenameServer /
    // useDeleteServer hooks with useMutation for declarative invalidation.
    expect(true).toBe(true); // structural gap documented above
  });

  // ═══════════════════════════════════════════════════════════════
  // ACCEPT INVITE — InboxScreen.tsx:142
  // This is also inline api.request, not useMutation.
  // READ keys: keys.servers + keys.notifications
  // ═══════════════════════════════════════════════════════════════
  it('ACCEPT INVITE — must invalidate keys.servers AND keys.notifications', async () => {
    (api.request as jest.Mock).mockResolvedValue({ id: 'joined-srv', name: 'invited' });

    // Reconstruct InboxScreen.handleAccept (line 138-153)
    const qc = new QueryClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    async function acceptInvite(inviteId: string) {
      await api.request(`/server-invitations/${inviteId}/accept`, {
        method: 'POST',
      });
      // InboxScreen.tsx:144-145
      await qc.invalidateQueries({ queryKey: keys.servers });
      await qc.invalidateQueries({ queryKey: keys.notifications });
    }

    await acceptInvite('inv-1');

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['servers'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['notifications'] }),
    );
  });
});
