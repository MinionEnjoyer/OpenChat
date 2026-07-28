/**
 * Gateway singleton, wired to the session (ticket via bearer), the connection
 * store (banner), and the sync layer (event application + reconnect repair).
 */
import { GatewayClient } from './gateway';
import { api } from '../stores/session';
import { useConnection } from '../stores/connection';
import { applyEvent, resyncAll } from '../sync/queryClient';
import { resolveConfig } from '../lib/config';

export const gateway = new GatewayClient({
  wsUrl: resolveConfig().wsUrl,
  fetchTicket: async () => {
    const res = await api.request<{ ticket: string }>('/auth/ws-ticket');
    return res.ticket;
  },
  onEvent: applyEvent,
  onStateChange: (state) => useConnection.getState().setState(state),
  onResync: resyncAll,
});
