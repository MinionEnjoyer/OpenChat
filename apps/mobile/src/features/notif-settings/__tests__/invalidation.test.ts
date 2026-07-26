/**
 * Invalidation tests for notification settings mutations
 * (NotificationSettingsScreen.tsx).
 *
 * Exercises the REAL hooks extracted from NotificationSettingsScreen.
 * Mocking only the network boundary (api.request).
 *
 * READ side (the oracle):
 *   NotificationSettingsScreen.tsx:48 → useQuery({ queryKey: keys.notificationSettings, ... })
 */
import { useUpsertNotifSetting, useDeleteNotifSetting } from '../NotificationSettingsScreen';
import { api } from '../../../stores/session';
import { keys } from '../../../sync/keys';
import { runInvalidationTest } from '../../../__tests__/mutationInvalidationHelper';

jest.mock('../../../stores/session', () => ({
  api: { request: jest.fn() },
  useSession: { getState: jest.fn().mockReturnValue({ status: 'signedIn', user: null }) },
}));

const READ_KEY = keys.notificationSettings; // from NotificationSettingsScreen.tsx:48

describe('notification settings mutation invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('UPSERT — must invalidate keys.notificationSettings after PUT', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'ns-1', scope: 'SERVER', scopeId: 'srv-1', level: 'MENTIONS', mutedUntil: null,
    });

    const result = await runInvalidationTest(
      'useUpsertNotifSetting',
      () => useUpsertNotifSetting(),
      { scope: 'SERVER' as const, scopeId: 'srv-1', level: 'MENTIONS' },
      READ_KEY,
    );

    expect(result.invalidated).toBe(true);
  });

  it('DELETE — must invalidate keys.notificationSettings after DELETE', async () => {
    (api.request as jest.Mock).mockResolvedValue({ success: true } as const);

    const result = await runInvalidationTest(
      'useDeleteNotifSetting',
      () => useDeleteNotifSetting(),
      'ns-1',
      READ_KEY,
    );

    expect(result.invalidated).toBe(true);
  });
});
