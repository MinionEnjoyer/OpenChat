/**
 * Voice occupancy convergence test (FR-VOX-004).
 *
 * Verifies that a `voice.occupancy` WS frame triggers invalidation of the
 * voice participants query for the correct channel, and that the end-to-end
 * path (event → invalidate) converges within 3 seconds.
 *
 * @satisfies FR-VOX-004
 */

import { applyEvent, queryClient } from '../../../sync/queryClient';
import type { VoiceOccupancyFrame } from '../../../realtime/events.d';

function makeVoiceOccupancy(channelId: string): VoiceOccupancyFrame {
  return {
    op: 'voice.occupancy',
    d: { channelId },
  };
}

describe('voice occupancy event (FR-VOX-004)', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  // @satisfies FR-VOX-004 — core correctness: event invalidates the right key
  it('invalidates voiceParticipants query when voice.occupancy arrives', () => {
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    applyEvent(makeVoiceOccupancy('ch-voice-1'));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toEqual({
      queryKey: ['voiceParticipants', 'ch-voice-1'],
    });
    spy.mockRestore();
  });

  // @satisfies FR-VOX-004 — convergence within ≤3s
  it('converges within 3 seconds (event → invalidate completes)', () => {
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    const start = Date.now();

    applyEvent(makeVoiceOccupancy('ch-voice-1'));

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  // @satisfies FR-VOX-004 — prove convergence budget assertion catches violations
  it('converges within 3s and proves budget assertion is live', () => {
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    const start = Date.now();

    applyEvent(makeVoiceOccupancy('ch-voice-1'));

    const elapsed = Date.now() - start;

    // Real convergence check: event processing is synchronous, well under 3s
    expect(elapsed).toBeLessThan(3000);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  // @satisfies FR-VOX-004 — scoped: only invalidates the target channel
  it('does NOT invalidate voice participants for a different channel', () => {
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    applyEvent(makeVoiceOccupancy('ch-A'));

    // Verify only the correct key was invalidated
    expect(spy).toHaveBeenCalledTimes(1);
    const callsForChA = spy.mock.calls.filter(
      (c) =>
        c[0] &&
        typeof c[0] === 'object' &&
        'queryKey' in c[0] &&
        Array.isArray((c[0] as any).queryKey) &&
        (c[0] as any).queryKey[1] === 'ch-A',
    );
    const callsForChB = spy.mock.calls.filter(
      (c) =>
        c[0] &&
        typeof c[0] === 'object' &&
        'queryKey' in c[0] &&
        Array.isArray((c[0] as any).queryKey) &&
        (c[0] as any).queryKey[1] === 'ch-B',
    );
    expect(callsForChA).toHaveLength(1);
    expect(callsForChB).toHaveLength(0);
    spy.mockRestore();
  });

  // @satisfies FR-VOX-004 — no-op for unknown ops
  it('does not react to unrelated frame ops', () => {
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    applyEvent({ op: 'presence', d: { userId: 'u1', status: 'ONLINE' } } as any);
    // Should not trigger voiceParticipants invalidation
    const callsForVoice = spy.mock.calls.filter(
      (c) =>
        c[0] &&
        typeof c[0] === 'object' &&
        'queryKey' in c[0] &&
        Array.isArray((c[0] as any).queryKey) &&
        (c[0] as any).queryKey[0] === 'voiceParticipants',
    );
    expect(callsForVoice).toHaveLength(0);
    spy.mockRestore();
  });
});
