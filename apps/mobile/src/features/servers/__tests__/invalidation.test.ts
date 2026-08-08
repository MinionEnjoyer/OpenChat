/**
 * Invalidation tests for server-scoped mutations.
 *
 * Exercises the REAL extracted hooks. Mocking only the network boundary
 * (api.request). The read-side oracle derives expected keys from the
 * actual reader components.
 *
 * READ side (the oracle):
 *   - Server list: ShellScreen.tsx:154 → useQuery({ queryKey: keys.servers, ... })
 *   - Channel list: ShellScreen.tsx:162 → useQuery({ queryKey: keys.channels(serverId), ... })
 */
import type { UseMutationResult } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { useCreateServer } from '../screens/CreateServerScreen';
import { useRenameServer, useDeleteServer } from '../screens/ServerSettingsScreen';
import { useAcceptInvite, useDeclineInvite } from '../../inbox/screens/InboxScreen';
import { api } from '../../../stores/session';
import { keys } from '../../../sync/keys';
import type { Server } from '../../../api/schema';

jest.mock('../../../stores/session', () => ({
  api: { request: jest.fn() },
  useSession: { getState: jest.fn().mockReturnValue({ status: 'signedIn', user: null }) },
}));

/**
 * Render a mutation hook and return the mutation result and a spied QueryClient.
 */
function renderMutationHook<TData, TVariables>(
  useHook: () => UseMutationResult<TData, Error, TVariables>,
): { result: UseMutationResult<TData, Error, TVariables>; qc: QueryClient } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ref: { current: UseMutationResult<TData, Error, TVariables> | null } = { current: null };

  function Harness(): React.JSX.Element {
    const mutation = useHook();
    ref.current = mutation;
    return React.createElement(React.Fragment, null);
  }

  act(() => {
    renderer.create(
      React.createElement(QueryClientProvider, { client: qc },
        React.createElement(Harness),
      ),
    );
  });

  return { result: ref.current!, qc };
}

const SERVERS_KEY = keys.servers; // from ShellScreen.tsx:154
const NOTIFS_KEY = keys.notifications; // from InboxScreen.tsx:138

describe('server mutation invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════
  // CREATE SERVER
  // READ key: keys.servers = ['servers']
  // ═══════════════════════════════════════════════════════════════
  it('CREATE SERVER — must invalidate keys.servers after POST /servers', async () => {
    (api.request as jest.Mock).mockResolvedValue({ id: 'srv-new', name: 'test' } as Server);

    const { result, qc } = renderMutationHook(() => useCreateServer());
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await act(async () => { await result.mutateAsync('test-server'); });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: SERVERS_KEY }));
  });

  // ═══════════════════════════════════════════════════════════════
  // RENAME SERVER
  // READ key: keys.servers = ['servers']
  // ═══════════════════════════════════════════════════════════════
  it('RENAME SERVER — must invalidate keys.servers after PATCH /servers/:id', async () => {
    (api.request as jest.Mock).mockResolvedValue({ id: 'srv-1', name: 'renamed' } as Server);

    const { result, qc } = renderMutationHook(() => useRenameServer('srv-1'));
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await act(async () => { await result.mutateAsync('renamed'); });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: SERVERS_KEY }));
  });

  // ═══════════════════════════════════════════════════════════════
  // DELETE SERVER
  // READ key: keys.servers = ['servers']
  // ═══════════════════════════════════════════════════════════════
  it('DELETE SERVER — must invalidate keys.servers after DELETE /servers/:id', async () => {
    (api.request as jest.Mock).mockResolvedValue({ success: true } as const);

    const { result, qc } = renderMutationHook(() => useDeleteServer('srv-1'));
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await act(async () => { await result.mutateAsync(); });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: SERVERS_KEY }));
  });

  // ═══════════════════════════════════════════════════════════════
  // ACCEPT INVITE
  // READ keys: keys.servers AND keys.notifications
  // InboxScreen handleAccept invalidates BOTH.
  // ═══════════════════════════════════════════════════════════════
  it('ACCEPT INVITE — must invalidate keys.servers AND keys.notifications', async () => {
    (api.request as jest.Mock).mockResolvedValue({ id: 'joined-srv', name: 'New' } as Server);

    const { result, qc } = renderMutationHook(() => useAcceptInvite());
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await act(async () => { await result.mutateAsync('inv-1'); });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: SERVERS_KEY }));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: NOTIFS_KEY }));
  });

  // ═══════════════════════════════════════════════════════════════
  // DECLINE INVITE
  // READ key: keys.notifications
  // ═══════════════════════════════════════════════════════════════
  it('DECLINE INVITE — must invalidate keys.notifications', async () => {
    (api.request as jest.Mock).mockResolvedValue({ success: true } as const);

    const { result, qc } = renderMutationHook(() => useDeclineInvite());
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await act(async () => { await result.mutateAsync('inv-2'); });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: NOTIFS_KEY }));
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: SERVERS_KEY }));
  });

});
