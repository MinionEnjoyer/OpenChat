import { useConnection } from '../connection';

/**
 * FR-APP-003's unit half: banner state logic. The on-device airplane-mode
 * cycle is tools/e2e-offline-banner.sh (banner appears ≤15s offline, clears
 * on reconnect), run at the phase gate.
 */
// @satisfies FR-APP-003
describe('connection store → banner state', () => {
  beforeEach(() => useConnection.setState({ state: 'offline', everConnected: false }));

  it('no banner before the first successful connect (app is just starting)', () => {
    useConnection.getState().setState('connecting');
    const s = useConnection.getState();
    // Banner condition is everConnected && state !== 'connected'
    expect(s.everConnected && s.state !== 'connected').toBe(false);
  });

  it('a drop after connecting shows the banner; reconnect clears it', () => {
    const store = useConnection.getState();
    store.setState('connected');
    useConnection.getState().setState('offline');
    let s = useConnection.getState();
    expect(s.everConnected && s.state !== 'connected').toBe(true);

    useConnection.getState().setState('connecting');
    s = useConnection.getState();
    expect(s.everConnected && s.state !== 'connected').toBe(true);

    useConnection.getState().setState('connected');
    s = useConnection.getState();
    expect(s.everConnected && s.state !== 'connected').toBe(false);
  });
});
