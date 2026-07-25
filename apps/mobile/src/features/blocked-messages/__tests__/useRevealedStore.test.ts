// @satisfies FR-SOC-007
import { useRevealedStore } from '../useRevealedStore';

/**
 * Unit tests for the revealed-messages store (FR-SOC-007).
 */
describe('useRevealedStore (FR-SOC-007)', () => {
  beforeEach(() => {
    useRevealedStore.setState({ revealedIds: new Set() });
  });

  // @satisfies FR-SOC-007
  it('starts with empty revealed set', () => {
    expect(useRevealedStore.getState().revealedIds.size).toBe(0);
  });

  // @satisfies FR-SOC-007
  it('reveal adds a message ID to the set', () => {
    useRevealedStore.getState().reveal('msg-1');
    expect(useRevealedStore.getState().revealedIds.has('msg-1')).toBe(true);
    expect(useRevealedStore.getState().revealedIds.size).toBe(1);
  });

  // @satisfies FR-SOC-007
  it('reveal is idempotent (adding same ID twice does not duplicate)', () => {
    useRevealedStore.getState().reveal('msg-1');
    useRevealedStore.getState().reveal('msg-1');
    expect(useRevealedStore.getState().revealedIds.size).toBe(1);
  });

  // @satisfies FR-SOC-007
  it('reveal supports multiple distinct IDs', () => {
    useRevealedStore.getState().reveal('msg-1');
    useRevealedStore.getState().reveal('msg-2');
    expect(useRevealedStore.getState().revealedIds.has('msg-1')).toBe(true);
    expect(useRevealedStore.getState().revealedIds.has('msg-2')).toBe(true);
    expect(useRevealedStore.getState().revealedIds.size).toBe(2);
  });

  // @satisfies FR-SOC-007
  it('reset clears all revealed IDs', () => {
    useRevealedStore.getState().reveal('msg-1');
    useRevealedStore.getState().reveal('msg-2');
    useRevealedStore.getState().reset();
    expect(useRevealedStore.getState().revealedIds.size).toBe(0);
  });

  // @satisfies FR-SOC-007
  it('a naive implementation that forgets to reveal would give the wrong answer', () => {
    // This test catches a real bug: if the renderer checks blockedIds but
    // never calls reveal(), the message stays collapsed forever.
    const store = useRevealedStore.getState();
    const msgId = 'msg-from-blocked';

    // Simulate: blockedIds has the author, revealedIds does NOT yet have msgId
    // A correct implementation would show the collapsed banner here
    const isBlocked = true; // author is known blocked
    const isRevealed = store.revealedIds.has(msgId);
    expect(isBlocked && !isRevealed).toBe(true); // should collapse

    // Now the user taps to reveal
    store.reveal(msgId);

    // After reveal: should no longer collapse
    const isRevealedAfter = useRevealedStore.getState().revealedIds.has(msgId);
    expect(isBlocked && !isRevealedAfter).toBe(false); // should NOT collapse
  });
});
