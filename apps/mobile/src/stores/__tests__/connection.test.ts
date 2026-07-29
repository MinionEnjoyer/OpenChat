import { useConnection } from '../connection';

/**
 * Unit test: connection store banner state logic.
 * Integration coverage for FR-APP-003 lives in connection.integration.test.ts.
 */
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
