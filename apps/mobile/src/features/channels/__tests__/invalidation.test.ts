/**
 * Invalidation tests for channel CRUD mutations (channels/hooks.ts).
 *
 * Exercises the REAL hooks. Mocking only the network boundary (api.request).
 * The read-side oracle derives expected keys from the actual reader components.
 *
 * READ side (the oracle):
 *   Channel list: ShellScreen.tsx:162 → useQuery({ queryKey: keys.channels(serverId), ... })
 */
import { useCreateChannel, useUpdateChannel, useDeleteChannel, useReorderChannels } from '../hooks';
import { api } from '../../../stores/session';
import { keys } from '../../../sync/keys';
import { runInvalidationTest } from '../../../__tests__/mutationInvalidationHelper';
import type { Channel } from '../../../api/schema';

jest.mock('../../../stores/session', () => ({
  api: { request: jest.fn() },
  useSession: { getState: jest.fn().mockReturnValue({ status: 'signedIn', user: null }) },
}));

const SERVER_ID = 'srv-test';
const READ_KEY = keys.channels(SERVER_ID); // from ShellScreen.tsx:162

describe('channel mutation invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CREATE CHANNEL — must invalidate keys.channels(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'ch-new', serverId: SERVER_ID, name: 'general', type: 'TEXT',
      topic: null, categoryId: null, parentId: null, position: 0,
    } as Channel);

    const result = await runInvalidationTest(
      'useCreateChannel',
      () => useCreateChannel(SERVER_ID),
      { name: 'general', type: 'TEXT' as const },
      READ_KEY,
    );

    expect(result.invalidated).toBe(true);
  });

  it('UPDATE CHANNEL — must invalidate keys.channels(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'ch-1', serverId: SERVER_ID, name: 'updated', type: 'TEXT',
      topic: null, categoryId: null, parentId: null, position: 1,
    } as Channel);

    const result = await runInvalidationTest(
      'useUpdateChannel',
      () => useUpdateChannel(SERVER_ID),
      { channelId: 'ch-1', name: 'updated' },
      READ_KEY,
    );

    expect(result.invalidated).toBe(true);
  });

  it('DELETE CHANNEL — must invalidate keys.channels(serverId) (KNOWN BROKEN #3)', async () => {
    (api.request as jest.Mock).mockResolvedValue({ success: true } as const);

    const result = await runInvalidationTest(
      'useDeleteChannel',
      () => useDeleteChannel(SERVER_ID),
      'ch-to-delete',
      READ_KEY,
    );

    expect(result.invalidated).toBe(true);
  });

  it('REORDER CHANNELS — must invalidate keys.channels(serverId)', async () => {
    (api.request as jest.Mock).mockResolvedValue({ success: true } as const);

    const result = await runInvalidationTest(
      'useReorderChannels',
      () => useReorderChannels(SERVER_ID),
      ['ch-3', 'ch-1', 'ch-2'],
      READ_KEY,
    );

    expect(result.invalidated).toBe(true);
  });
});
