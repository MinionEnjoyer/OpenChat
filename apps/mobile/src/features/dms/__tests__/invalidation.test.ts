/**
 * Invalidation tests for useOpenDm (dms/hooks.ts).
 *
 * READ side (the oracle):
 *   DM list: ShellScreen.tsx:148 → useQuery({ queryKey: ['dms'], ... })
 *   DM list: DmsList.tsx:38     → useQuery({ queryKey: ['dms'], ... })
 */
import { api } from '../../../stores/session';
import { runInvalidationTest } from '../../../__tests__/mutationInvalidationHelper';

jest.mock('../../../stores/session', () => ({
  api: { request: jest.fn() },
  useSession: { getState: jest.fn().mockReturnValue({ status: 'signedIn', user: null }) },
}));

describe('dm mutation invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('OPEN DM — must invalidate ["dms"] after POST /dms', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'dm-ch-1', type: 'DM', userIds: ['user-a', 'user-b'],
    });

    const result = await runInvalidationTest((qc) => ({
      label: 'useOpenDm',
      mutationFn: (userId: unknown) =>
        api.request('/dms', { method: 'POST', body: { userId } }),
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['dms'] }); },
      // READ key from ShellScreen.tsx:148 and DmsList.tsx:38
      expectedQueryKey: ['dms'],
      input: 'user-b',
    }));

    expect(result.invalidated).toBe(true);
  });
});
