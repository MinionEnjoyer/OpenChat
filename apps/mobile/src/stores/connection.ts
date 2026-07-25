/**
 * Connection store: the gateway's state, feeding the FR-APP-003 banner.
 * `everConnected` distinguishes the first connect (no banner — the app is just
 * starting) from a drop (banner).
 */
import { create } from 'zustand';
import type { ConnectionState } from '../realtime/gateway';

interface ConnectionStore {
  state: ConnectionState;
  everConnected: boolean;
  setState(state: ConnectionState): void;
}

export const useConnection = create<ConnectionStore>((set) => ({
  state: 'offline',
  everConnected: false,
  setState: (state) =>
    set((prev) => ({ state, everConnected: prev.everConnected || state === 'connected' })),
}));
