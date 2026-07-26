/**
 * Invalidation tests for notification settings mutations
 * (notif-settings/NotificationSettingsScreen.tsx).
 *
 * READ side (the oracle):
 *   NotificationSettingsScreen.tsx:48 → useQuery({ queryKey: keys.notificationSettings, ... })
 */
import { keys } from '../../../sync/keys';
import { api } from '../../../stores/session';
import { runInvalidationTest } from '../../../__tests__/mutationInvalidationHelper';

jest.mock('../../../stores/session', () => ({
  api: { request: jest.fn() },
  useSession: { getState: jest.fn().mockReturnValue({ status: 'signedIn', user: null }) },
}));

describe('notification settings mutation invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('UPSERT — must invalidate keys.notificationSettings after PUT', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'ns-1', scope: 'SERVER', scopeId: 'srv-1', level: 'MENTIONS', mutedUntil: null,
    });

    const result = await runInvalidationTest((qc) => ({
      label: 'upsertMut (notification settings)',
      mutationFn: (input: unknown) =>
        api.request('/notifications/settings', { method: 'PUT', body: input }),
      onSuccess: () => { qc.invalidateQueries({ queryKey: keys.notificationSettings }); },
      expectedQueryKey: keys.notificationSettings,
      input: { scope: 'SERVER', scopeId: 'srv-1', level: 'MENTIONS' },
    }));

    expect(result.invalidated).toBe(true);
  });

  it('DELETE — must invalidate keys.notificationSettings after DELETE', async () => {
    (api.request as jest.Mock).mockResolvedValue({ success: true } as const);

    const result = await runInvalidationTest((qc) => ({
      label: 'deleteMut (notification settings)',
      mutationFn: (settingId: unknown) =>
        api.request(`/notifications/settings/${settingId}`, { method: 'DELETE' }),
      onSuccess: () => { qc.invalidateQueries({ queryKey: keys.notificationSettings }); },
      expectedQueryKey: keys.notificationSettings,
      input: 'ns-1',
    }));

    expect(result.invalidated).toBe(true);
  });
});
