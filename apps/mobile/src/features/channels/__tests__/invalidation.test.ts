/**
 * Invalidation tests for channel CRUD mutations (channels/hooks.ts).
 *
 * Known-broken case #3: DELETE CHANNEL — channel still listed after deletion.
 *
 * READ side (the oracle):
 *   Channel list: ShellScreen.tsx:162 → useQuery({ queryKey: keys.channels(serverId), ... })
 */
import { keys } from '../../../sync/keys';
import { api } from '../../../stores/session';
import { runInvalidationTest } from '../../../__tests__/mutationInvalidationHelper';
import type { Channel } from '../../../api/schema';

jest.mock('../../../stores/session', () => ({
  api: { request: jest.fn() },
  useSession: { getState: jest.fn().mockReturnValue({ status: 'signedIn', user: null }) },
}));

const SERVER_ID = 'srv-test';

describe('channel mutation invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════
  // CREATE CHANNEL
  // READ key: keys.channels(serverId) = ['channels', serverId]
  // ═══════════════════════════════════════════════════════════════
  it('CREATE CHANNEL — must invalidate keys.channels(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'ch-new', serverId: SERVER_ID, name: 'general', type: 'TEXT',
      topic: null, categoryId: null, parentId: null, position: 0,
    } as Channel);

    const result = await runInvalidationTest((qc) => ({
      label: 'useCreateChannel',
      mutationFn: (input: unknown) =>
        api.request(`/servers/${SERVER_ID}/channels`, { method: 'POST', body: input }),
      onSuccess: () => { qc.invalidateQueries({ queryKey: keys.channels(SERVER_ID) }); },
      expectedQueryKey: ['channels', SERVER_ID], // from ShellScreen.tsx:162
      input: { name: 'general', type: 'TEXT' as const },
    }));

    expect(result.invalidated).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════
  // UPDATE CHANNEL
  // READ key: keys.channels(serverId) = ['channels', serverId]
  // ═══════════════════════════════════════════════════════════════
  it('UPDATE CHANNEL — must invalidate keys.channels(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'ch-1', serverId: SERVER_ID, name: 'updated', type: 'TEXT',
      topic: null, categoryId: null, parentId: null, position: 1,
    } as Channel);

    const result = await runInvalidationTest((qc) => ({
      label: 'useUpdateChannel',
      mutationFn: (input: unknown) => {
        const { channelId, ...data } = input as { channelId: string; name?: string };
        return api.request(`/servers/${SERVER_ID}/channels/${channelId}`, {
          method: 'PATCH', body: data,
        });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: keys.channels(SERVER_ID) }); },
      expectedQueryKey: ['channels', SERVER_ID],
      input: { channelId: 'ch-1', name: 'updated' },
    }));

    expect(result.invalidated).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════
  // DELETE CHANNEL — KNOWN BROKEN (#3)
  // Bug: channel deleted server-side but still listed in the UI.
  //
  // READ key (ShellScreen.tsx:162): keys.channels(serverId)
  // = ['channels', serverId]
  //
  // This reconstructs useDeleteChannel from channels/hooks.ts
  // (line 55-66).  The onSuccess calls:
  //   qc.invalidateQueries({ queryKey: keys.channels(serverId) })
  //
  // This SHOULD match the reader's key exactly.  If this test FAILS,
  // either the invalidation key is wrong or the hook's onSuccess
  // never fires.
  // ═══════════════════════════════════════════════════════════════
  it('DELETE CHANNEL — must invalidate keys.channels(serverId) (KNOWN BROKEN #3)', async () => {
    (api.request as jest.Mock).mockResolvedValue({ success: true } as const);

    const result = await runInvalidationTest((qc) => ({
      label: 'useDeleteChannel',
      mutationFn: (channelId: unknown) =>
        api.request(`/servers/${SERVER_ID}/channels/${channelId}`, { method: 'DELETE' }),
      onSuccess: () => { qc.invalidateQueries({ queryKey: keys.channels(SERVER_ID) }); },
      expectedQueryKey: ['channels', SERVER_ID],
      input: 'ch-to-delete',
    }));

    expect(result.invalidated).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════
  // REORDER CHANNELS
  // READ key: keys.channels(serverId) = ['channels', serverId]
  // ═══════════════════════════════════════════════════════════════
  it('REORDER CHANNELS — must invalidate keys.channels(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({ success: true } as const);

    const result = await runInvalidationTest((qc) => ({
      label: 'useReorderChannels',
      mutationFn: (orderedIds: unknown) =>
        api.request(`/servers/${SERVER_ID}/channels/reorder`, {
          method: 'PATCH', body: { orderedIds },
        }),
      onSuccess: () => { qc.invalidateQueries({ queryKey: keys.channels(SERVER_ID) }); },
      expectedQueryKey: ['channels', SERVER_ID],
      input: ['ch-3', 'ch-1', 'ch-2'],
    }));

    expect(result.invalidated).toBe(true);
  });
});
