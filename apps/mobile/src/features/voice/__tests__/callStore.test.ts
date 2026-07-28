/**
 * CallStore unit tests (FR-VOX-005).
 *
 * @satisfies FR-VOX-005
 */
import { useCallStore } from '../CallStore';

describe('CallStore', () => {
  beforeEach(() => {
    useCallStore.setState({ incomingCall: null });
  });

  describe('initial state', () => {
    it('has no incoming call by default', () => {
      expect(useCallStore.getState().incomingCall).toBeNull();
    });
  });

  describe('ring', () => {
    it('sets incomingCall with full payload', () => {
      useCallStore.getState().ring({
        channelId: 'ch-1',
        callerId: 'user-alice',
        callerName: 'Alice',
        callerAvatar: null,
      });
      expect(useCallStore.getState().incomingCall).toEqual({
        channelId: 'ch-1',
        callerId: 'user-alice',
        callerName: 'Alice',
        callerAvatar: null,
      });
    });

    it('replaces a previous incoming call with a new one', () => {
      useCallStore.getState().ring({
        channelId: 'ch-1',
        callerId: 'user-alice',
        callerName: 'Alice',
        callerAvatar: null,
      });
      useCallStore.getState().ring({
        channelId: 'ch-2',
        callerId: 'user-bob',
        callerName: 'Bob',
        callerAvatar: null,
      });
      expect(useCallStore.getState().incomingCall?.callerName).toBe('Bob');
      expect(useCallStore.getState().incomingCall?.channelId).toBe('ch-2');
    });
  });

  describe('dismiss', () => {
    it('clears incomingCall', () => {
      useCallStore.getState().ring({
        channelId: 'ch-1',
        callerId: 'user-alice',
        callerName: 'Alice',
        callerAvatar: null,
      });
      useCallStore.getState().dismiss();
      expect(useCallStore.getState().incomingCall).toBeNull();
    });

    it('is a no-op when no call is ringing', () => {
      useCallStore.getState().dismiss();
      expect(useCallStore.getState().incomingCall).toBeNull();
    });
  });

  describe('accept', () => {
    it('clears incomingCall', () => {
      useCallStore.getState().ring({
        channelId: 'ch-1',
        callerId: 'user-alice',
        callerName: 'Alice',
        callerAvatar: null,
      });
      useCallStore.getState().accept();
      expect(useCallStore.getState().incomingCall).toBeNull();
    });

    it('is a no-op when no call is ringing', () => {
      useCallStore.getState().accept();
      expect(useCallStore.getState().incomingCall).toBeNull();
    });
  });
});
